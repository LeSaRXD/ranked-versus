"use strict";
window.addEventListener("load", () => {
    const header = document.querySelector("header");
    header === null || header === void 0 ? void 0 : header.addEventListener("click", () => {
        window.location.assign("./index.html");
    });
});
