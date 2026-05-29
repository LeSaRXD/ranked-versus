window.addEventListener("load", () => {
	const header = document.querySelector("header");
	header?.addEventListener("click", () => {
		window.location.assign("./index.html");
	});
});
