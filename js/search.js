import { fetch_api } from "./api.js";
window.addEventListener("load", async () => {
    const LEADERBOARD_URL = "https://api.mcsrranked.com/leaderboard";
    const leaderboard = await fetch_api(LEADERBOARD_URL, "Error getting leaderboard!");
    load_lb_datalist(leaderboard);
});
const load_lb_datalist = (lb) => {
    const datalist = document.getElementById("leaderboard");
    const datalistOptions = lb.users.map((user) => {
        const option = document.createElement("option");
        option.value = user.nickname;
        return option;
    });
    datalist.replaceChildren(...datalistOptions);
    const search = document.getElementById("search");
    search.disabled = false;
    const search_season = document.getElementById("search_season");
    search_season.value = lb.season.number.toString();
};
