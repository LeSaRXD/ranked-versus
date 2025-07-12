window.addEventListener("load", () => {
	const header = document.querySelector("header");
	if (header === null)
		return;
	header.addEventListener("click", () => {
		window.location.assign("./index.html");
	});
});
