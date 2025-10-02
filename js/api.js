;
;
export const fetch_json = (url, callback) => {
    fetch(url).then((res) => res.json().then(callback).catch(fetch_error)).catch(fetch_error);
};
export const fetch_error = (err) => {
    if (err === "User is not exists.") {
        alert("User does not exist! Please try a different username");
        window.location.assign("./index.html");
        return;
    }
    alert("An error occurred! Check console for more info");
    console.error(err);
};
