type ApiError = {
	status: "error",
	data: string | null,
}
type ApiSuccess<T> = {
	status: "success"
	data: T,
}
type ApiResponse<T> = ApiError | ApiSuccess<T>;

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

export class JsonError {
	readonly error: ApiError;
	constructor(error: ApiError) {
		this.error = error;
	}
}

const USER_NOT_FOUND = "User is not exists.";
export const fetch_api = async <T>(url: string, err_msg?: string | undefined): Promise<T> => {
	try {
		let res = await fetch(url);
		let json: ApiResponse<T> = await res.json();
		if (json.status === "error")
			throw new JsonError(json);
		return json.data;
	} catch (err) {
		if (err instanceof JsonError && err.error.data === USER_NOT_FOUND) {
			alert("User does not exist! Please try a different username.");
			window.location.assign("./index.html");
			throw null;
		}
		alert(err_msg ?? "An error occurred! Check console for more info");
		console.error(err);
		throw err;
	}
}
