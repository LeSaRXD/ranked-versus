const MATCHES_PER_LOAD = 100;
let total = {
	"uuid": null,
	"loading": true,
	"loaded": 0,
	"before": null,
	"after": null,
	"matches": [],
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
	const API_URL = "https://api.mcsrranked.com/users/";
	const user_url = API_URL + user;
	fetch_json(user_url, parse_user);
}

const fetch_error = (err) => {
	alert("An error occurred! Check console for more info");
	console.error(err);
}

const parse_user = (res) => {
	if (res.status === "error")
		return fetch_error(res.data);

	const player = res.data;
	if (player === undefined)
		return fetch_error("Response data is null");

	total.uuid = player.uuid;
	username.innerText = player.nickname;
	user_avatar.src = `https://mineskin.eu/helm/${total.uuid}`;
	user_elo.innerText = `${player.eloRate} ELO`;

	get_matches();
}

const update_loading_status = () => {
	const text = total.loading ?
		`Loading ${total.loaded} matches...` :
		`Loaded ${total.loaded} matches`;
	loading_status.innerText = text;
}
const get_matches = () => {
	let api_url = `https://api.mcsrranked.com/users/${total.uuid}/matches?count=${MATCHES_PER_LOAD}&excludedecay=true&type=2`;
	if (total.before !== null)
		api_url += `&before=${total.before}`;
	if (total.after !== null)
		api_url += `&after=${total.after}`;

	total.loaded += MATCHES_PER_LOAD;
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

	total.loaded += matches.length - MATCHES_PER_LOAD;
	if (matches.length > 0) {
		total.before = matches[matches.length - 1].id;
		total.matches.push(...matches);
		get_matches();
	} else {
		total.loading = false;
		finished_loading();
	}

	update_loading_status();
}

const finished_loading = () => {
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
				"opponent": opponent,
				"matches": [match]
			};
	}

	const sort_func = (data1, data2) => (data2.matches.length - data1.matches.length);

	const datas = [...Object.values(opponent_datas)].sort(sort_func);

	const processed = process_datas(datas);
	display_opponents(processed);
}

const process_datas = (datas) => {
	return datas.map((data) => {
		let wins = 0,
			draws = 0,
			losses = 0,
			win_completions = 0,
			loss_completions = 0,
			win_completions_time = 0,
			loss_completions_time = 0,
			elo_change = 0;

		for (const match of data.matches) {
			const won = match.result?.uuid === total.uuid;
			const drew = match.result?.uuid === null;
			const completed = !match.forfeited;
			const elo_delta = match.changes.find((ch) => ch.uuid === total.uuid)?.change;
			if (elo_delta === undefined) {
				console.warn("Expected ELO change for user, found:", match.changes);
				continue;
			}

			if (won) {
				wins += 1;
				win_completions += completed;
				win_completions_time += match.result?.time ?? 0;
			} else if (drew) {
				draws += 1;
			} else {
				losses += 1;
				loss_completions += completed;
				loss_completions_time += match.result?.time ?? 0;
			}
			elo_change += elo_delta;
		}

		return {
			"opponent": data.opponent,
			wins, draws, losses,
			win_completions, loss_completions,
			"win_average": Math.round(win_completions_time / win_completions / 1000),
			"loss_average": Math.round(loss_completions_time / loss_completions / 1000),
			elo_change,
		};
	});
}

const display_opponents = (datas) => {
	const opponent_card = opponents.children[0];
	if (opponent_card == undefined) {
		console.error("Cound not find opponent card node, exiting...");
		return;
	}
	opponents.removeChild(opponent_card);

	for (const data of datas) {
		let win_time = "--", loss_time = "--";
		if (data.win_completions > 0) {
			let win_minutes = Math.floor(data.win_average / 60),
				win_seconds = (data.win_average % 60).toString().padStart(2, "0");
			win_time = `${win_minutes}:${win_seconds}`;
		}
		if (data.loss_completions > 0) {
			let loss_minutes = Math.floor(data.loss_average / 60),
				loss_seconds = (data.loss_average % 60).toString().padStart(2, "0");
			loss_time = `${loss_minutes}:${loss_seconds}`;
		}

		const new_card = opponent_card.cloneNode(true);

		new_card.querySelector(".opponent_avatar").src = `https://mineskin.eu/helm/${data.opponent.uuid}`;
		const opp_name = new_card.querySelector(".opponent_username");
		opp_name.innerText = data.opponent.nickname;
		opp_name.href = `./search.html?username=${data.opponent.nickname}`;

		const win_draw_loss = new_card.querySelector(".win_draw_loss");
		win_draw_loss.querySelector(".wins.counter").innerText = data.wins;
		win_draw_loss.querySelector(".draws.counter").innerText = data.draws;
		win_draw_loss.querySelector(".losses.counter").innerText = data.losses;

		const averages = new_card.querySelector(".averages");
		averages.querySelector(".wins.counter").innerText = win_time;
		averages.querySelector(".losses.counter").innerText = loss_time;

		const elo_change = new_card.querySelector(".elo_change");
		if (data.elo_change > 0) {
			elo_change.classList.add("wins");
			elo_change.innerText = `+${data.elo_change} ELO`;
		} else if (data.elo_change < 0) {
			elo_change.classList.add("losses");
			elo_change.innerText = `${data.elo_change} ELO`;
		} else {
			elo_change.classList.add("draws");
			elo_change.innerText = `${data.elo_change} ELO`;
		}

		opponents.appendChild(new_card);
	}
}
