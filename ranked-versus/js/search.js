const MATCHES_PER_LOAD = 100;

const Filter = {
	EQUAL: 0,
	LESS_EQUAL: -1,
	LESS: -2,
	GREATER_EQUAL: 1,
	GREATER: 2,
	from_str: (value) => {
		return {
			"equal": Filter.EQUAL,
			"less_equal": Filter.LESS_EQUAL,
			"less": Filter.LESS,
			"greater_equal": Filter.GREATER_EQUAL,
			"greater": Filter.GREATER,
		}[value] ?? undefined;
	}
};

const total = {
	uuid: null,
	nickname: null,
	loading: true,
	num_loaded: 0,
	before: null,
	after: 0,
	datas: {},
	results: {},
	sort_by: [
		["total", true],
		["total", true],
	],
	filter_by: [
		["total", Filter.GREATER, 1],
	]
};

const time_to_string = (time) => {
	time = Math.floor(time);
	let minutes = Math.floor(time / 60),
		seconds = (time % 60).toString().padStart(2, "0");
	return `${minutes}:${seconds}`;
}

window.addEventListener("load", () => {
	const params = new URLSearchParams(window.location.search);
	if (!params.has("username")) {
		window.location = "./index.html";
		return;
	}

	opponent_card_node = opponents.children[0];
	opponents.replaceChildren();
	opponent_card_node.style.display = "";

	const opponent_matches = opponent_card_node.querySelector(".opponent_matches");
	opponent_match_node = opponent_matches.children[0];
	opponent_matches.replaceChildren();

	sort_select.addEventListener("change", on_sort_change);
	sort_direction.addEventListener("click", on_sort_direction_change);
	filter_select_id.addEventListener("change", on_filter_change);
	filter_select_cmp.addEventListener("change", on_filter_change);
	filter_select_value.addEventListener("change", on_filter_change);

	const username = params.get("username");
	fetch_player(username);
});

const fetch_json = (url, callback) => {
	fetch(url).then((res) => res.json().then(callback).catch(fetch_error)).catch(fetch_error);
}

const fetch_player = (user) => {
	const user_url = `https://api.mcsrranked.com/users/${user}`;
	fetch_json(user_url, parse_user);
}

const fetch_error = (err) => {
	if (err === "User is not exists.") {
		alert("User does not exist! Please try a different username");
		window.location = "./index.html";
		return;
	}
	alert("An error occurred! Check console for more info");
	console.error(err);
}

const parse_user = (res) => {
	if (res.status === "error")
		return fetch_error(res.data);

	const player = res.data;
	if (player === undefined)
		return fetch_error("Response data is null");

	display_player(player);

	load_cache();
	get_matches();
}

const display_player = (player) => {
	total.uuid = player.uuid;
	total.nickname = player.nickname;
	username.innerText = player.nickname;
	user_avatar.src = `https://mineskin.eu/helm/${player.uuid}`;
	user_elo.innerText = `${player.eloRate} ELO`;
}

const load_cache = () => {
	const CURRENT_VERSION = "2";
	const prev_version = localStorage.getItem("version");

	if (prev_version !== CURRENT_VERSION) {
		localStorage.clear();
		localStorage.setItem("version", CURRENT_VERSION);
		return;
	}

	total.after = parseInt(localStorage.getItem(`after_${total.uuid}`) ?? "0");
	if (isNaN(total.after))
		total.after = 0;
	total.results = JSON.parse(localStorage.getItem(`results_${total.uuid}`) ?? "{}");
	total.num_loaded = Object.values(total.results).reduce((partial, curr) => partial + curr.total, 0);
}

const update_loading_status = () => {
	const text = total.loading ?
		`Loading ${total.num_loaded} matches...` :
		`Loaded ${total.num_loaded} matches`;
	loading_status.innerText = text;
}

const get_matches = () => {
	let matches_url = `https://api.mcsrranked.com/users/${total.uuid}/matches?count=${MATCHES_PER_LOAD}&excludedecay=true&type=2`;
	if (total.before !== null)
		matches_url += `&before=${total.before}`;
	if (total.after !== null)
		matches_url += `&after=${total.after}`;

	total.num_loaded += MATCHES_PER_LOAD;
	fetch_json(matches_url, got_matches);
	update_loading_status();
}

const got_matches = (res) => {
	if (res.status === "error")
		return fetch_error(res.data);

	const new_matches = res.data;
	if (new_matches === undefined)
		return fetch_error("Response data is null");

	if (!(new_matches instanceof Array))
		return fetch_error("Response has wrong type");

	total.num_loaded -= MATCHES_PER_LOAD;

	for (const match of new_matches) {
		const opponent = match.players.find((o) => o.uuid != total.uuid);
		if (opponent === undefined || opponent.uuid === undefined) {
			console.warn("Could not find opponent in match", match);
			continue;
		}
		match.curr_opponent = opponent;

		total.num_loaded += 1;

		if (opponent.uuid in total.datas) {
			total.datas[opponent.uuid].matches.push(match);
			total.datas[opponent.uuid].opponent = opponent;
		} else
			total.datas[opponent.uuid] = {
				opponent,
				matches: [match],
			};

		if (total.before === null || total.before > match.id)
			total.before = match.id;
	}

	if (new_matches.length >= MATCHES_PER_LOAD)
		get_matches();
	else
		finished_loading();

	update_loading_status();
}

const finished_loading = () => {
	total.loading = false;
	process_datas();
	display_opponents();
}

const process_datas = () => {
	for (const [opp_uuid, data] of Object.entries(total.datas)) {
		if (!(opp_uuid in total.results)) {
			total.results[opp_uuid] = {
				total: 0,
				wins: 0,
				draws: 0,
				losses: 0,
				win_completions: 0,
				loss_completions: 0,
				win_completions_time: 0,
				loss_completions_time: 0,
				elo_change: 0,
			};
		}
		let result = total.results[opp_uuid];
		result.opponent = data.opponent;

		for (const match of data.matches) {
			const won = match.result?.uuid === total.uuid;
			const drew = match.result?.uuid === null;
			const completed = !match.forfeited;
			const elo_change = match.changes.find((ch) => ch.uuid === total.uuid)?.change;
			if (elo_change === undefined) {
				console.warn("Expected ELO change for user, found:", match.changes);
				continue;
			}

			result.total += 1;
			if (won) {
				result.wins += 1;
				if (completed) {
					result.win_completions += 1;
					result.win_completions_time += match.result?.time ?? 0;
				}
			} else if (drew) {
				result.draws += 1;
			} else {
				result.losses += 1;
				if (completed) {
					result.loss_completions += 1;
					result.loss_completions_time += match.result?.time ?? 0;
				}
			}
			result.elo_change += elo_change;

			if (match.id > total.after)
				total.after = match.id;
		}
	}
	save_cache();

	for (const result of Object.values(total.results)) {
		result.win_average = result.win_completions > 0 ?
			Math.round(result.win_completions_time / result.win_completions / 1000)
			: null;
		result.loss_average = result.loss_completions > 0 ?
			Math.round(result.loss_completions_time / result.loss_completions / 1000)
			: null;
	}
}

const save_cache = () => {
	localStorage.setItem(`after_${total.uuid}`, total.after);
	localStorage.setItem(`results_${total.uuid}`, JSON.stringify(total.results));
}

let opponent_card_node = undefined;
const display_opponents = () => {
	if (opponent_card_node === undefined) {
		console.error("Cound not find opponent card node, exiting...");
		return;
	}
	opponents.replaceChildren();

	let results = filter_results(Object.values(total.results));
	results = sort_results(results);

	const opponent_nodes = results.map((result) => {
		let win_time = "--", loss_time = "--";

		if (result.win_completions > 0)
			win_time = time_to_string(result.win_average);
		if (result.loss_completions > 0)
			loss_time = time_to_string(result.loss_average);

		const new_card_node = opponent_card_node.cloneNode(true);

		new_card_node.querySelector(".opponent_avatar").src = `https://mineskin.eu/helm/${result.opponent.uuid}`;
		const opp_name = new_card_node.querySelector(".opponent_username");
		opp_name.innerText = result.opponent.nickname;
		opp_name.href = `./search.html?username=${result.opponent.nickname}`;

		const win_draw_loss = new_card_node.querySelector(".win_draw_loss");
		win_draw_loss.querySelector(".wins.counter").innerText = result.wins;
		win_draw_loss.querySelector(".draws.counter").innerText = result.draws;
		win_draw_loss.querySelector(".losses.counter").innerText = result.losses;

		const averages = new_card_node.querySelector(".averages");
		averages.querySelector(".wins.counter").innerText = win_time;
		averages.querySelector(".losses.counter").innerText = loss_time;

		const elo_change = new_card_node.querySelector(".elo_change");
		if (result.elo_change > 0) {
			elo_change.classList.add("wins");
			elo_change.innerText = `+${result.elo_change} ELO`;
		} else if (result.elo_change < 0) {
			elo_change.classList.add("losses");
			elo_change.innerText = `${result.elo_change} ELO`;
		} else {
			elo_change.classList.add("draws");
			elo_change.innerText = `${result.elo_change} ELO`;
		}

		new_card_node.querySelector(".opponent_link").href = `https://mcsrranked.com/stats/${total.nickname}/vs/${result.opponent.nickname}`;

		new_card_node.querySelector(".opponent_expand").addEventListener("click", on_opponent_expand.bind(undefined, result.opponent.nickname));

		return new_card_node;
	});

	opponents.replaceChildren(...opponent_nodes);
}

const filter_results = (result_values) => {
	return result_values.filter((res) => {
		filters: for (const [id, cmp, value] of total.filter_by) {
			if (!res.hasOwnProperty(id)) {
				console.warn(`Expected property ${id}, found result: `, res);
				continue;
			}

			if (res[id] === null)
				return false;

			switch (cmp) {
				case Filter.EQUAL:
					if (res[id] == value)
						continue filters;
					break;

				case Filter.LESS:
					if (res[id] < value)
						continue filters;
					break;

				case Filter.LESS_EQUAL:
					if (res[id] <= value)
						continue filters;
					break;

				case Filter.GREATER:
					if (res[id] > value)
						continue filters;
					break;

				case Filter.GREATER_EQUAL:
					if (res[id] >= value)
						continue filters;
					break;

				default:
					console.warn(`Filter operation ${cmp} doesn't exist!`);
					continue filters;
			}

			return false;
		}

		return true;
	})
}

const sort_results = (result_values) => {
	return result_values.sort((r1, r2) => {
		for (const [id, reverse] of total.sort_by) {
			if (!r1.hasOwnProperty(id) || !r2.hasOwnProperty(id)) {
				console.warn(`Expected property ${id}, found results: `, r1, r2);
				continue;
			}

			const v1 = r1[id], v2 = r2[id];

			if (v1 === v2)
				continue;
			if (v1 === null)
				return 1;
			if (v2 === null)
				return -1;

			return (v1 - v2) * (reverse ? -1 : 1);
		}
		return 0;
	});
}

const on_filter_change = () => {
	const filter_by = filter_select_id.value;
	if (filter_by === undefined)
		return;

	let filter_cmp = filter_select_cmp.value;
	if (filter_cmp === undefined)
		return;

	filter_cmp = Filter.from_str(filter_cmp);
	if (filter_cmp === undefined)
		return;

	let filter_value = filter_select_value.value;
	if (filter_value === undefined)
		return;

	filter_value = parseInt(filter_value);
	if (isNaN(filter_value)) {
		alert("Invalid filter value!");
		filter_select_value.value = "1";
		filter_value = 1;
	}

	total.filter_by[0] = [filter_by, filter_cmp, filter_value];
	display_opponents();
}

const on_sort_change = () => {
	const sort_by = sort_select.value;
	if (sort_by === undefined)
		return;

	total.sort_by[0][0] = sort_by;
	display_opponents();
}
const on_sort_direction_change = () => {
	const dir = !total.sort_by[0][1];
	total.sort_by[0][1] = dir;
	sort_direction.style.transform = dir ? "" : "scale(1, -1)";

	display_opponents();
}

let opponent_match_node = undefined;
const on_opponent_expand = (opp_nickname, e) => {
	const opponent_matches = e.target.parentElement.parentElement.querySelector(".opponent_matches");
	if (opponent_matches.style.display === "none") {
		opponent_matches.style.display = "";
		e.target.classList.add("expanded");
	} else {
		opponent_matches.style.display = "none";
		e.target.classList.remove("expanded");
	}

	const versus_url = `https://api.mcsrranked.com/users/${total.nickname}/versus/${opp_nickname}/matches?count=100&type=2`;
	fetch_json(versus_url, on_opponent_expand_response.bind(undefined, opponent_matches));
}
const on_opponent_expand_response = (opp_matches, json) => {
	if (json.status !== "success")
		return fetch_error(json.data);

	const matches = json.data;
	if (!(matches instanceof Array)) {
		console.warn("Expected array of matches, got", matches);
		return;
	}

	const match_nodes = matches.map((match) => {
		const new_match_node = opponent_match_node.cloneNode(true);
		new_match_node.href = `https://mcsrranked.com/stats/${total.nickname}/${match.id}?matches=ranked&sort=newest`

		const time_str = time_to_string(match.result.time / 1000);
		const time = new_match_node.querySelector(".match_time");
		time.innerText = time_str;
		time.classList.add(match.result.uuid === total.uuid ? "wins" : "losses");

		const FORFEIT_URL = "./static/forfeit.png";
		const COMPLETION_URL = "./static/completion.png";
		const forfeit_img = new_match_node.querySelector(".match_forfeit");
		forfeit_img.src = match.forfeited ? FORFEIT_URL : COMPLETION_URL;
		forfeit_img.title = match.forfeited ? "forfeited" : "completed";

		return new_match_node;
	});
	opp_matches.replaceChildren(...match_nodes);
}
