const status = document.querySelector("#copy-status");

if (navigator.clipboard?.writeText) {
  for (const button of document.querySelectorAll("[data-copy]")) {
    const command = document.getElementById(button.dataset.copy);
    button.hidden = false;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(command.textContent.trim());
        status.textContent = "Command copied.";
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = "Copy"; }, 1800);
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(command);
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = "Command selected. Use your keyboard shortcut to copy.";
      }
    });
  }
}
