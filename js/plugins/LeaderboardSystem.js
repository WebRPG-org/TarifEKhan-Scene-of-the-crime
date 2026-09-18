/*:
 * @target MZ
 * @plugindesc Leaderboard system tracking completion time
 * @author Claude
 */

(() => {
    function getSupabaseClient() {
        return window._supabaseClient || null;
    }

    window.LeaderboardManager = class {
        static startTime = null;
        static completionTime = null;

        static startTimer() {
            this.startTime = Date.now();
        }

        static async completeLevel() {
            if (!this.startTime) return 0;

            this.completionTime = Date.now();
            const timeInSeconds = Math.floor((this.completionTime - this.startTime) / 1000);

            await this.submitScore(timeInSeconds);
            return timeInSeconds;
        }

        static async submitScore(timeInSeconds) {
            const client = getSupabaseClient();
            if (!client) {
                console.error('Supabase not configured');
                return;
            }
            if (!window.AuthManager || !window.AuthManager.isAuthenticated() || window.AuthManager.isGuest()) return;

            const { error } = await client
                .from('leaderboard')
                .insert({
                    user_id: window.AuthManager.getUserId(),
                    username: window.AuthManager.getUsername(),
                    completion_time: timeInSeconds
                });

            if (error) console.error('Leaderboard submit error:', error);
        }

        static async getTopScores(limit = 10) {
            const client = getSupabaseClient();
            if (!client) {
                console.error('Supabase not configured');
                return [];
            }

            const { data, error } = await client
                .from('leaderboard')
                .select('username, completion_time')
                .order('completion_time', { ascending: true })
                .limit(limit);

            if (error) {
                console.error('Leaderboard fetch error:', error);
                return [];
            }

            return data || [];
        }

        static formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        if (!LeaderboardManager.startTime) {
            LeaderboardManager.startTimer();
        }
    };

    const _Game_Switches_setValue = Game_Switches.prototype.setValue;
    Game_Switches.prototype.setValue = function(switchId, value) {
        _Game_Switches_setValue.call(this, switchId, value);
        if (switchId === 4 && value === true) {
            LeaderboardManager.completeLevel().then(time => {
                $gameMessage.add(`Completed in ${LeaderboardManager.formatTime(time)}!`);
            });
        }
    };
})();
