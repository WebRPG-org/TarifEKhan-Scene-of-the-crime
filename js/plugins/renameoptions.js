(() => {
    const _Window_TitleCommand_makeCommandList =
        Window_TitleCommand.prototype.makeCommandList;

    Window_TitleCommand.prototype.makeCommandList = function() {
        _Window_TitleCommand_makeCommandList.call(this);

        const command = this._list.find(cmd => cmd.symbol === "options");
        if (command) {
            command.name = "Audio";
        }
    };

    Window_MenuCommand.prototype.addOptionsCommand = function() {
        this.addCommand("Audio", "options", true);
    };
})();