(() => {
    const GLOBAL_BGM = {
        name: "Land of Evermorning",
        volume: 90,
        pitch: 100,
        pan: 0
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        const current = AudioManager._currentBgm;
        if (!current || current.name !== GLOBAL_BGM.name) {
            AudioManager.playBgm(GLOBAL_BGM);
        }
    };
})();