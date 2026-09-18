/*:
 * @target MZ
 * @plugindesc Add Leaderboard button to Title Screen
 * @author Claude
 */

(() => {
    // Add Leaderboard command to title screen
    const _Window_TitleCommand_makeCommandList = Window_TitleCommand.prototype.makeCommandList;
    Window_TitleCommand.prototype.makeCommandList = function() {
        _Window_TitleCommand_makeCommandList.call(this);
        this.addCommand("Leaderboard", "leaderboard", true);
    };

    // Add handler for leaderboard command
    const _Scene_Title_createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function() {
        _Scene_Title_createCommandWindow.call(this);
        this._commandWindow.setHandler("leaderboard", this.commandLeaderboard.bind(this));
    };

    // Increase window height to accommodate the new button (from 4 to 5)
    const _Scene_Title_commandWindowRect = Scene_Title.prototype.commandWindowRect;
    Scene_Title.prototype.commandWindowRect = function() {
        const offsetX = $dataSystem.titleCommandWindow.offsetX;
        const offsetY = $dataSystem.titleCommandWindow.offsetY;
        const ww = this.mainCommandWidth();
        const wh = this.calcWindowHeight(5, true); // Changed from 4 to 5 for leaderboard option
        const wx = (Graphics.boxWidth - ww) / 2 + offsetX;
        const wy = Graphics.boxHeight - wh - 96 + offsetY;
        return new Rectangle(wx, wy, ww, wh);
    };

    // Command to open leaderboard scene
    Scene_Title.prototype.commandLeaderboard = function() {
        this._commandWindow.close();
        SceneManager.push(Scene_Leaderboard);
    };
})();
