import { fetch_json } from "./api.js";
window.addEventListener("load", () => {
    const LEADERBOARD_URL = "https://api.mcsrranked.com/leaderboard";
    fetch_json(LEADERBOARD_URL, get_leaderboard);
});
const get_leaderboard = (lb) => {
    if (lb.status === "error") {
        console.error("Error getting leaderboard!", lb.data);
        return;
    }
    if (lb.data === null) {
        console.warn("Response data is null!", lb.status);
        return;
    }
    const datalist = document.getElementById("leaderboard");
    const datalistOptions = lb.data.users.map((user) => {
        const option = document.createElement("option");
        option.value = user.nickname;
        return option;
    });
    datalist.replaceChildren(...datalistOptions);
    const search = document.getElementById("search");
    search.disabled = false;
    const search_season = document.getElementById("search_season");
    search_season.value = lb.data.season.number.toString();
};
