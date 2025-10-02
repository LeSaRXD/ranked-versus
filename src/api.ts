export type ApiResponse<T> = {
	status: "error",
	data: string | null,
} | {
	status: "success"
	data: T | null,
};

export interface Player {
	uuid: string,
	nickname: string,
	eloRate: number | null,
}
export interface VsResult {
	total: number,
	wins: number,
	draws: number,
	losses: number,
	win_completions: number,
	loss_completions: number,
	win_completions_time: number,
	loss_completions_time: number,
	win_average: number | null,
	loss_average: number | null,
	elo_change: number,
	opponent: Player,
};
export interface Match {
	id: number,
	forfeited: boolean,
	players: Player[],
	result: {
		uuid: string,
		time: number,
	},
	changes: {
		uuid: string,
		change: number,
	}[]
};
export interface Leaderboard {
	season: {
		startsAt: number,
		endsAt: number,
		number: number,
	},
	users: Player[],
}

export type Callback = (json: any) => any;
export const fetch_json = (url: string, callback: Callback) => {
	fetch(url).then((res) => res.json().then(callback).catch(fetch_error)).catch(fetch_error);
}

export const fetch_error = (err: string | null) => {
	if (err === "User is not exists.") {
		alert("User does not exist! Please try a different username");
		window.location.assign("./index.html");
		return;
	}
	alert("An error occurred! Check console for more info");
	console.error(err);
}
