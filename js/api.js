;
;
export class JsonError {
    constructor(error) {
        this.error = error;
    }
}
const USER_NOT_FOUND = "User is not exists.";
export const fetch_api = async (url, err_msg) => {
    try {
        let res = await fetch(url);
        let json = await res.json();
        if (json.status === "error")
            throw new JsonError(json);
        return json.data;
    }
    catch (err) {
        if (err instanceof JsonError && err.error.data === USER_NOT_FOUND) {
            alert("User does not exist! Please try a different username.");
            window.location.assign("./index.html");
            throw null;
        }
        alert(err_msg !== null && err_msg !== void 0 ? err_msg : "An error occurred! Check console for more info");
        console.error(err);
        throw err;
    }
};
