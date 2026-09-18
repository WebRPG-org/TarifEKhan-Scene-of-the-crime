/*:
 * @target MZ
 * @plugindesc Leaderboard display scene
 * @author Claude
 */

class Scene_Leaderboard extends Scene_MenuBase {
    create() {
        super.create();
        this.createLeaderboardWindow();
        this.loadScores();
    }

    createLeaderboardWindow() {
        const rect = this.leaderboardWindowRect();
        this._leaderboardWindow = new Window_Leaderboard(rect);
        this._leaderboardWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(this._leaderboardWindow);
    }

    leaderboardWindowRect() {
        const ww = Graphics.boxWidth - 100;
        const wh = Graphics.boxHeight - 100;
        const wx = 50;
        const wy = 50;
        return new Rectangle(wx, wy, ww, wh);
    }

    async loadScores() {
        const scores = await LeaderboardManager.getTopScores(10);
        this._leaderboardWindow.setScores(scores);
    }
}

class Window_Leaderboard extends Window_Selectable {
    initialize(rect) {
        super.initialize(rect);
        this._scores = [];
        this.activate();
    }

    setScores(scores) {
        this._scores = scores;
        this.refresh();
    }

    maxItems() {
        return this._scores.length;
    }

    drawItem(index) {
        const score = this._scores[index];
        const rect = this.itemLineRect(index);
        const rank = index + 1;
        const name = score.username || 'Guest';
        const time = LeaderboardManager.formatTime(score.completion_time);

        this.changeTextColor(ColorManager.systemColor());
        this.drawText(`#${rank}`, rect.x, rect.y, 50);
        this.resetTextColor();
        this.drawText(name, rect.x + 60, rect.y, 200);
        this.drawText(time, rect.x + rect.width - 100, rect.y, 100, 'right');
    }

    refresh() {
        this.contents.clear();
        this.drawAllItems();
    }
}
