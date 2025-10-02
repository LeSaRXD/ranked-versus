"use strict";
const MATCHES_PER_LOAD = 100;
var Filter;
(function (Filter) {
    Filter[Filter["EQUAL"] = 0] = "EQUAL";
    Filter[Filter["LESS_EQUAL"] = -1] = "LESS_EQUAL";
    Filter[Filter["LESS"] = -2] = "LESS";
    Filter[Filter["GREATER_EQUAL"] = 1] = "GREATER_EQUAL";
    Filter[Filter["GREATER"] = 2] = "GREATER";
})(Filter || (Filter = {}));
(function (Filter) {
    Filter.from_str = (value) => {
        var _a;
        return (_a = {
            "equal": Filter.EQUAL,
            "less_equal": Filter.LESS_EQUAL,
            "less": Filter.LESS,
            "greater_equal": Filter.GREATER_EQUAL,
            "greater": Filter.GREATER,
        }[value]) !== null && _a !== void 0 ? _a : null;
    };
})(Filter || (Filter = {}));
;
;
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
    let minutes = Math.floor(time / 60), seconds = (time % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
};
window.addEventListener("load", () => {
    var _a, _b, _c, _d, _e;
    const params = new URLSearchParams(window.location.search);
    const username = params.get("username");
    if (username === null) {
        window.location.assign("./index.html");
        return;
    }
    const opponents = document.getElementById("opponents");
    opponent_card_node = opponents.children[0];
    opponents.replaceChildren();
    opponent_card_node.style.display = "";
    const opponent_matches = opponent_card_node.querySelector(".opponent_matches");
    opponent_match_node = opponent_matches.children[0];
    opponent_matches.replaceChildren();
    (_a = document.getElementById("sort_select")) === null || _a === void 0 ? void 0 : _a.addEventListener("change", on_sort_change);
    (_b = document.getElementById("sort_direction")) === null || _b === void 0 ? void 0 : _b.addEventListener("click", on_sort_direction_change);
    (_c = document.getElementById("filter_select_id")) === null || _c === void 0 ? void 0 : _c.addEventListener("change", on_filter_change);
    (_d = document.getElementById("filter_select_cmp")) === null || _d === void 0 ? void 0 : _d.addEventListener("change", on_filter_change);
    (_e = document.getElementById("filter_select_value")) === null || _e === void 0 ? void 0 : _e.addEventListener("change", on_filter_change);
    load_url(params);
    fetch_player(username);
});
const fetch_json = (url, callback) => {
    fetch(url).then((res) => res.json().then(callback).catch(fetch_error)).catch(fetch_error);
};
const fetch_player = (user) => {
    const user_url = `https://api.mcsrranked.com/users/${user}`;
    fetch_json(user_url, parse_user);
};
const fetch_error = (err) => {
    if (err === "User is not exists.") {
        alert("User does not exist! Please try a different username");
        window.location.assign("./index.html");
        return;
    }
    alert("An error occurred! Check console for more info");
    console.error(err);
};
const parse_user = (res) => {
    if (res.status === "error")
        return fetch_error(res.data);
    const player = res.data;
    if (player === null)
        return fetch_error("Response data is null");
    display_player(player);
    load_cache();
    get_matches();
};
const display_player = (player) => {
    total.uuid = player.uuid;
    total.nickname = player.nickname;
    const username_span = document.getElementById("username");
    const user_avatar_img = document.getElementById("user_avatar");
    const user_elo_span = document.getElementById("user_elo");
    username_span.innerText = player.nickname;
    user_avatar_img.src = `https://mineskin.eu/helm/${player.uuid}`;
    user_elo_span.innerText = player.eloRate === null ? "Unrated" : `${player.eloRate} ELO`;
};
const load_cache = () => {
    var _a, _b;
    const CURRENT_VERSION = "2";
    const prev_version = localStorage.getItem("version");
    if (prev_version !== CURRENT_VERSION) {
        localStorage.clear();
        localStorage.setItem("version", CURRENT_VERSION);
        return;
    }
    total.after = parseInt((_a = localStorage.getItem(`after_${total.uuid}`)) !== null && _a !== void 0 ? _a : "0");
    if (isNaN(total.after))
        total.after = 0;
    total.results = JSON.parse((_b = localStorage.getItem(`results_${total.uuid}`)) !== null && _b !== void 0 ? _b : "{}");
    total.num_loaded = Object.values(total.results).reduce((partial, curr) => partial + curr.total, 0);
};
const update_loading_status = () => {
    const text = total.loading ?
        `Loading ${total.num_loaded} matches...` :
        `Loaded ${total.num_loaded} matches`;
    const loading_status = document.getElementById("loading_status");
    loading_status.innerText = text;
};
const get_matches = () => {
    let matches_url = `https://api.mcsrranked.com/users/${total.uuid}/matches?count=${MATCHES_PER_LOAD}&excludedecay=true&type=2`;
    if (total.before !== null)
        matches_url += `&before=${total.before}`;
    if (total.after !== null)
        matches_url += `&after=${total.after}`;
    total.num_loaded += MATCHES_PER_LOAD;
    fetch_json(matches_url, got_matches);
    update_loading_status();
};
;
const got_matches = (res) => {
    if (res.status === "error")
        return fetch_error(res.data);
    const new_matches = res.data;
    if (new_matches === null)
        return fetch_error("Response data is null");
    total.num_loaded -= MATCHES_PER_LOAD;
    for (const match of new_matches) {
        const opponent = match.players.find((o) => o.uuid != total.uuid);
        if (opponent === undefined || opponent.uuid === undefined) {
            console.warn("Could not find opponent in match", match);
            continue;
        }
        total.num_loaded += 1;
        const curr_data = total.datas[opponent.uuid];
        if (curr_data) {
            curr_data.matches.push(match);
            curr_data.opponent = opponent;
        }
        else
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
};
const finished_loading = () => {
    total.loading = false;
    process_datas();
    display_opponents();
};
const process_datas = () => {
    var _a, _b, _c, _d, _e, _f, _g;
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
                win_average: null,
                loss_average: null,
                elo_change: 0,
                opponent: {},
            };
        }
        let result = total.results[opp_uuid];
        result.opponent = data.opponent;
        for (const match of data.matches) {
            const won = ((_a = match.result) === null || _a === void 0 ? void 0 : _a.uuid) === total.uuid;
            const drew = ((_b = match.result) === null || _b === void 0 ? void 0 : _b.uuid) === null;
            const completed = !match.forfeited;
            const elo_change = (_c = match.changes.find((ch) => ch.uuid === total.uuid)) === null || _c === void 0 ? void 0 : _c.change;
            if (elo_change === undefined) {
                console.warn("Expected ELO change for user, found:", match.changes);
                continue;
            }
            result.total += 1;
            if (won) {
                result.wins += 1;
                if (completed) {
                    result.win_completions += 1;
                    result.win_completions_time += (_e = (_d = match.result) === null || _d === void 0 ? void 0 : _d.time) !== null && _e !== void 0 ? _e : 0;
                }
            }
            else if (drew) {
                result.draws += 1;
            }
            else {
                result.losses += 1;
                if (completed) {
                    result.loss_completions += 1;
                    result.loss_completions_time += (_g = (_f = match.result) === null || _f === void 0 ? void 0 : _f.time) !== null && _g !== void 0 ? _g : 0;
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
};
const save_cache = () => {
    localStorage.setItem(`after_${total.uuid}`, total.after.toString());
    localStorage.setItem(`results_${total.uuid}`, JSON.stringify(total.results));
};
let opponent_card_node = undefined;
const display_opponents = () => {
    const opp_card_node = opponent_card_node;
    if (opp_card_node === undefined) {
        console.error("Cound not find opponent card node, exiting...");
        return;
    }
    const opponents = document.getElementById("opponents");
    opponents.replaceChildren();
    let results = filter_results(Object.values(total.results));
    results = sort_results(results);
    const opponent_nodes = results.map((result) => {
        let win_time = "--", loss_time = "--";
        if (result.win_average !== null)
            win_time = time_to_string(result.win_average);
        if (result.loss_average !== null)
            loss_time = time_to_string(result.loss_average);
        const new_card_node = opp_card_node.cloneNode(true);
        new_card_node.querySelector(".opponent_avatar").src = `https://mineskin.eu/helm/${result.opponent.uuid}`;
        const opp_name = new_card_node.querySelector(".opponent_username");
        opp_name.innerText = result.opponent.nickname;
        opp_name.href = `./search.html?username=${result.opponent.nickname}`;
        const win_draw_loss = new_card_node.querySelector(".win_draw_loss");
        win_draw_loss.querySelector(".wins.counter").innerText = result.wins.toString();
        win_draw_loss.querySelector(".draws.counter").innerText = result.draws.toString();
        win_draw_loss.querySelector(".losses.counter").innerText = result.losses.toString();
        const averages = new_card_node.querySelector(".averages");
        averages.querySelector(".wins.counter").innerText = win_time;
        averages.querySelector(".losses.counter").innerText = loss_time;
        const elo_change = new_card_node.querySelector(".elo_change");
        if (result.elo_change > 0) {
            elo_change.classList.add("wins");
            elo_change.innerText = `+${result.elo_change} ELO`;
        }
        else if (result.elo_change < 0) {
            elo_change.classList.add("losses");
            elo_change.innerText = `${result.elo_change} ELO`;
        }
        else {
            elo_change.classList.add("draws");
            elo_change.innerText = `${result.elo_change} ELO`;
        }
        new_card_node.querySelector(".opponent_link").href = `https://mcsrranked.com/stats/${total.nickname}/vs/${result.opponent.nickname}`;
        new_card_node.querySelector(".opponent_expand").addEventListener("click", on_opponent_expand.bind(undefined, result.opponent.nickname));
        return new_card_node;
    });
    opponents.replaceChildren(...opponent_nodes);
};
const filter_results = (result_values) => {
    return result_values.filter((res) => {
        filters: for (const [id, cmp, value] of total.filter_by) {
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
    });
};
const sort_results = (result_values) => {
    return result_values.sort((r1, r2) => {
        for (const [id, reverse] of total.sort_by) {
            if (id === "opponent") {
                console.warn("Cannot sort by opponent");
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
};
const FILTER_BY_PARAM = "fb", FILTER_VALUE_PARAM = "fv", FILTER_CMP_PARAM = "fc", SORT_BY_PARAM = "sb", SORT_DIR_PARAM = "sd";
const update_url = (param, value) => {
    let params = new URLSearchParams(window.location.search);
    params.set(param, value);
    history.replaceState(null, "", `?${params.toString()}`);
};
const load_url = (params) => {
    const id_to_index = (value) => {
        return [
            "total",
            "wins",
            "win_completions",
            "losses",
            "loss_completions",
            "draws",
            "elo_change",
            "win_average",
            "loss_average",
        ].findIndex((v) => v == value);
    };
    const cmp_to_index = (value) => {
        return [
            3,
            4,
            0,
            2,
            1,
        ][value + 2];
    };
    const filter_by_id = params.get(FILTER_BY_PARAM);
    if (filter_by_id !== null) {
        total.filter_by[0][0] = filter_by_id;
        const filter_select_id = document.getElementById("filter_select_id");
        filter_select_id.selectedIndex = id_to_index(filter_by_id);
    }
    const filter_cmp_id = params.get(FILTER_CMP_PARAM);
    if (filter_cmp_id !== null) {
        let val = parseInt(filter_cmp_id);
        val = isNaN(val) ? 1 : val;
        total.filter_by[0][1] = val;
        const filter_select_cmp = document.getElementById("filter_select_cmp");
        filter_select_cmp.selectedIndex = cmp_to_index(val);
    }
    const filter_value = params.get(FILTER_VALUE_PARAM);
    if (filter_value !== null) {
        let val = parseInt(filter_value);
        val = isNaN(val) ? 1 : val;
        total.filter_by[0][2] = val;
        const filter_select_value = document.getElementById("filter_select_value");
        filter_select_value.value = val.toString();
    }
    const sort_by_id = params.get(SORT_BY_PARAM);
    if (sort_by_id !== null) {
        total.sort_by[0][0] = sort_by_id;
        const sort_select = document.getElementById("sort_select");
        sort_select.selectedIndex = id_to_index(sort_by_id);
    }
    const sort_dir = params.get(SORT_DIR_PARAM);
    if (sort_dir !== null) {
        const val = sort_dir == "1";
        total.sort_by[0][1] = val;
        const sort_direction = document.getElementById("sort_direction");
        sort_direction.style.transform = val ? "" : "scale(1, -1)";
    }
    console.log("Loaded", total.filter_by[0], total.sort_by[0]);
};
const on_filter_change = () => {
    var _a, _b, _c;
    const filter_by = (_a = document.getElementById("filter_select_id")) === null || _a === void 0 ? void 0 : _a.value;
    if (filter_by == null)
        return;
    const filter_cmp_str = (_b = document.getElementById("filter_select_cmp")) === null || _b === void 0 ? void 0 : _b.value;
    if (filter_cmp_str == null)
        return;
    const filter_cmp = Filter.from_str(filter_cmp_str);
    if (filter_cmp === null)
        return;
    const filter_value_str = (_c = document.getElementById("filter_select_value")) === null || _c === void 0 ? void 0 : _c.value;
    if (filter_value_str == null)
        return;
    let filter_value = parseInt(filter_value_str);
    if (isNaN(filter_value)) {
        alert("Invalid filter value!");
        const filter_select_value = document.getElementById("filter_select_value");
        filter_select_value.value = "1";
        filter_value = 1;
    }
    update_url(FILTER_BY_PARAM, filter_by);
    update_url(FILTER_CMP_PARAM, filter_cmp);
    update_url(FILTER_VALUE_PARAM, filter_value_str);
    total.filter_by[0] = [filter_by, filter_cmp, filter_value];
    display_opponents();
};
const on_sort_change = () => {
    const sort_select = document.getElementById("sort_select");
    const sort_by = sort_select.value;
    if (sort_by === undefined)
        return;
    update_url(SORT_BY_PARAM, sort_by);
    total.sort_by[0][0] = sort_by;
    display_opponents();
};
const on_sort_direction_change = () => {
    const dir = !total.sort_by[0][1];
    total.sort_by[0][1] = dir;
    const sort_direction = document.getElementById("sort_direction");
    sort_direction.style.transform = dir ? "" : "scale(1, -1)";
    update_url(SORT_DIR_PARAM, +dir);
    display_opponents();
};
let opponent_match_node = undefined;
const on_opponent_expand = (opp_nickname, e) => {
    var _a, _b, _c;
    const target = e.target;
    const opponent_matches = (_c = (_b = (_a = target.parentElement) === null || _a === void 0 ? void 0 : _a.parentElement) === null || _b === void 0 ? void 0 : _b.querySelector(".opponent_matches")) !== null && _c !== void 0 ? _c : undefined;
    if (opponent_matches === undefined) {
        console.warn("Cannot find opponent matches");
        return;
    }
    if (opponent_matches.style.display === "none") {
        opponent_matches.style.display = "";
        target.classList.add("expanded");
    }
    else {
        opponent_matches.style.display = "none";
        target.classList.remove("expanded");
    }
    const versus_url = `https://api.mcsrranked.com/users/${total.nickname}/versus/${opp_nickname}/matches?count=100&type=2`;
    fetch_json(versus_url, on_opponent_expand_response.bind(undefined, opponent_matches));
};
const on_opponent_expand_response = (opp_matches, json) => {
    if (json.status !== "success")
        return fetch_error(json.data);
    const matches = json.data;
    if (!(matches instanceof Array)) {
        console.warn("Expected array of matches, got", matches);
        return;
    }
    const opp_match_node = opponent_match_node;
    if (opp_match_node === undefined) {
        console.warn("Cannot find opponent match");
        return;
    }
    const match_nodes = matches.map((match) => {
        const new_match_node = opp_match_node.cloneNode(true);
        new_match_node.href = `https://mcsrranked.com/stats/${total.nickname}/${match.id}?matches=ranked&sort=newest`;
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
};
