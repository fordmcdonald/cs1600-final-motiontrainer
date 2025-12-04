let lastTriggerTime = 0;
// add event listener for triggered mock
window.addEventListener("keydown", (event) => {
    if (event.key === "t") {
        event.preventDefault();
        const now = Date.now();
        if (now - lastTriggerTime < 500) {
            return;
        }
        lastTriggerTime = now;

        window.electronAPI.triggerMocks();
    }
});