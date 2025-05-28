const MATCHES_PER_LOAD = 100;

const Filter = {
	EQUALS: 0,
	LESS_EQUAL: -1,
	LESS: -2,
	GREATER_EQUAL: 1,
	GREATER: 2,
};
const total = {
	uuid: null,
	loading: true,
	num_loaded: 0,
	before: null,
	after: 0,
	matches: [],
	results: {},
	sort_by: [
		["total", true],
		["win_average", false],
	],
	filter_by: [
		["total", Filter.GREATER, 1],
		// ["win_average", Filter.LESS_EQUAL, 12 * 60],
	]
};

window.addEventListener("load", () => {
	const params = new URLSearchParams(window.location.search);
	if (!params.has("username")) {
		window.location = "./index.html";
		return;
	}

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

	total.after = localStorage.getItem(`after_${total.uuid}`) ?? "0";
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
	let api_url = `https://api.mcsrranked.com/users/${total.uuid}/matches?count=${MATCHES_PER_LOAD}&excludedecay=true&type=2`;
	if (total.before !== null)
		api_url += `&before=${total.before}`;
	if (total.after !== null)
		api_url += `&after=${total.after}`;

	total.num_loaded += MATCHES_PER_LOAD;
	fetch_json(api_url, got_matches);
	update_loading_status();
}

const got_matches = (res) => {
	if (res.status === "error")
		return fetch_error(res.data);

	const matches = res.data;
	if (matches === undefined)
		return fetch_error("Response data is null");

	if (!(matches instanceof Array))
		return fetch_error("Response has wrong type");

	total.num_loaded += matches.length - MATCHES_PER_LOAD;
	if (matches.length > 0) {
		total.before = matches[matches.length - 1].id;
		total.matches.push(...matches);
	}
	if (matches.length >= MATCHES_PER_LOAD)
		get_matches();
	else
		finished_loading();

	update_loading_status();
}

const finished_loading = () => {
	total.loading = false;

	let opponent_datas = {};
	for (const match of total.matches) {
		if (!(match.players instanceof Array)) {
			console.warn("Expected array of players, got", match.players);
			continue;
		}

		const opponent = match.players.find((other) => other.uuid != total.uuid);
		if (opponent === undefined) {
			console.warn("Expected players other than current, got", match.players);
			continue;
		}

		if (opponent.uuid in opponent_datas)
			opponent_datas[opponent.uuid].matches.push(match);
		else
			opponent_datas[opponent.uuid] = {
				opponent,
				matches: [match]
			};
	}

	process_datas(opponent_datas);
	display_opponents();
}

const process_datas = (datas) => {
	for (const [opp_uuid, data] of Object.entries(datas)) {
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

const display_opponents = () => {
	const opponent_card = opponents.children[0];
	if (opponent_card == undefined) {
		console.error("Cound not find opponent card node, exiting...");
		return;
	}
	opponents.replaceChildren(opponent_card);
	opponent_card.style.display = "none"

	let results = filter_results(Object.values(total.results));
	results = sort_results(results);

	for (const result of results) {
		let win_time = "--", loss_time = "--";

		if (result.win_completions > 0) {
			let win_minutes = Math.floor(result.win_average / 60),
				win_seconds = (result.win_average % 60).toString().padStart(2, "0");

			win_time = `${win_minutes}:${win_seconds}`;
		}
		if (result.loss_completions > 0) {
			let loss_minutes = Math.floor(result.loss_average / 60),
				loss_seconds = (result.loss_average % 60).toString().padStart(2, "0");

			loss_time = `${loss_minutes}:${loss_seconds}`;
		}

		const new_card = opponent_card.cloneNode(true);
		new_card.style.display = "";

		new_card.querySelector(".opponent_avatar").src = `https://mineskin.eu/helm/${result.opponent.uuid}`;
		const opp_name = new_card.querySelector(".opponent_username");
		opp_name.innerText = result.opponent.nickname;
		opp_name.href = `./search.html?username=${result.opponent.nickname}`;

		const win_draw_loss = new_card.querySelector(".win_draw_loss");
		win_draw_loss.querySelector(".wins.counter").innerText = result.wins;
		win_draw_loss.querySelector(".draws.counter").innerText = result.draws;
		win_draw_loss.querySelector(".losses.counter").innerText = result.losses;

		const averages = new_card.querySelector(".averages");
		averages.querySelector(".wins.counter").innerText = win_time;
		averages.querySelector(".losses.counter").innerText = loss_time;

		const elo_change = new_card.querySelector(".elo_change");
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

		opponents.appendChild(new_card);
	}
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
				case Filter.EQUALS:
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
