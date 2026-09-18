/*:
 * @target MZ
 * @plugindesc Add Leaderboard to menu
 * @author Claude
 */

(() => {
    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function() {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand("Leaderboard", "leaderboard", true);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("leaderboard", this.commandLeaderboard.bind(this));
    };

    Scene_Menu.prototype.commandLeaderboard = function() {
        SceneManager.push(Scene_Leaderboard);
    };
})();
