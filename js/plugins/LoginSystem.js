//=============================================================================
// RPG Maker MZ - Login System
// LoginSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Server-based authentication system with login, registration, and guest mode.
 * @author Claude Code
 * @url https://github.com/yourusername/rmmz-login-system
 *
 * @param supabaseUrl
 * @text Supabase URL
 * @desc Your Supabase project URL
 * @default https://your-project.supabase.co
 *
 * @param supabaseKey
 * @text Supabase Anon Key
 * @desc Your Supabase anonymous key
 * @default your-anon-key
 *
 * @param enableGuestMode
 * @text Enable Guest Mode
 * @desc Allow players to skip login and play as guest
 * @type boolean
 * @default true
 *
 * @param sessionTimeout
 * @text Session Timeout (minutes)
 * @desc How long to keep user logged in (in minutes)
 * @type number
 * @default 1440
 *
 * @help LoginSystem.js
 *
 * This plugin adds a login screen before the title screen.
 *
 * Features:
 * - User registration with username/password via Supabase
 * - Login with custom username-based authentication
 * - Guest/offline mode option
 * - Session management with automatic token storage
 * - Secure password hashing with bcrypt
 * - Supabase backend integration
 *
 * Setup:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Get your project URL and anon key from Settings > API
 * 3. Run the SQL setup script to create tables and functions
 * 4. Configure supabaseUrl and supabaseKey parameters
 * 5. Enable/disable guest mode as needed
 *
 * Global Access:
 * - AuthManager.getUserId() - Get current user ID
 * - AuthManager.getUsername() - Get current username
 * - AuthManager.getToken() - Get authentication token
 * - AuthManager.isAuthenticated() - Check if user is logged in
 * - AuthManager.isGuest() - Check if user is in guest mode
 * - AuthManager.logout() - Clear session and logout
 */

(() => {
    const pluginName = "LoginSystem";
    const parameters = PluginManager.parameters(pluginName);
    const enableGuestMode = String(parameters['enableGuestMode'] || 'true') === 'true';
    const sessionTimeout = Number(parameters['sessionTimeout'] || 1440);

    const supabaseUrl = window.GAME_CONFIG?.SUPABASE_URL || 'https://your-project.supabase.co';
    const supabaseKey = window.GAME_CONFIG?.SUPABASE_ANON_KEY || 'your-anon-key';

    let supabase = null;
    if (typeof window.supabase !== 'undefined') {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        window._supabaseClient = supabase;
    }

    //-----------------------------------------------------------------------------
    // AuthManager
    // The static class that manages authentication state and API calls.

    function AuthManager() {
        throw new Error("This is a static class");
    }

    AuthManager._token = null;
    AuthManager._userId = null;
    AuthManager._username = null;
    AuthManager._isGuest = false;
    AuthManager._requestInProgress = false;

    AuthManager.initialize = function() {
        // Don't auto-load session - users must log in each time
        this.clearSession();
    };

    AuthManager.isAuthenticated = function() {
        return !!(this._token && this._userId);
    };

    AuthManager.isGuest = function() {
        return this._isGuest;
    };

    AuthManager.getToken = function() {
        return this._token;
    };

    AuthManager.getUserId = function() {
        return this._userId;
    };

    AuthManager.getUsername = function() {
        return this._username;
    };

    AuthManager.saveSession = function() {
        const sessionData = {
            token: this._token,
            userId: this._userId,
            username: this._username,
            isGuest: this._isGuest,
            timestamp: Date.now()
        };
        StorageManager.saveObject("authSession", sessionData);
    };

    AuthManager.loadSession = function() {
        StorageManager.loadObject("authSession")
            .then(session => {
                if (session && !this.isSessionExpired(session)) {
                    this._token = session.token;
                    this._userId = session.userId;
                    this._username = session.username;
                    this._isGuest = session.isGuest || false;
                }
            })
            .catch(() => {
                this.clearSession();
            });
    };

    AuthManager.clearSession = function() {
        this._token = null;
        this._userId = null;
        this._username = null;
        this._isGuest = false;
        StorageManager.remove("authSession");
    };

    AuthManager.isSessionExpired = function(session) {
        const timeout = sessionTimeout * 60 * 1000;
        return Date.now() - session.timestamp > timeout;
    };

    AuthManager.login = function(username, password) {
        if (!supabase) {
            return Promise.reject({ error: "Supabase not configured" });
        }

        return new Promise(async (resolve, reject) => {
            if (this._requestInProgress) {
                reject({ error: "Request already in progress" });
                return;
            }

            this._requestInProgress = true;

            try {
                const { data, error } = await supabase.rpc('login_user', {
                    p_username: username,
                    p_password: password
                });

                this._requestInProgress = false;

                if (error) {
                    reject({ error: error.message });
                } else if (data.error) {
                    reject({ error: data.error });
                } else {
                    this._token = data.token;
                    this._userId = data.userId;
                    this._username = data.username;
                    this._isGuest = false;
                    // Set the JWT on the shared Supabase client so RLS policies
                    // see the user as authenticated on all subsequent requests.
                    await supabase.auth.setSession({
                        access_token: data.token,
                        refresh_token: data.refresh_token || ''
                    });
                    this.saveSession();
                    resolve({
                        token: this._token,
                        userId: this._userId,
                        username: this._username
                    });
                }
            } catch (e) {
                this._requestInProgress = false;
                reject({ error: e.message || "Login failed" });
            }
        });
    };

    AuthManager.register = function(username, password) {
        if (!supabase) {
            return Promise.reject({ error: "Supabase not configured" });
        }

        return new Promise(async (resolve, reject) => {
            if (this._requestInProgress) {
                reject({ error: "Request already in progress" });
                return;
            }

            this._requestInProgress = true;

            try {
                const { data, error } = await supabase.rpc('register_user', {
                    p_username: username,
                    p_password: password
                });

                this._requestInProgress = false;

                if (error) {
                    reject({ error: error.message });
                } else if (data.error) {
                    reject({ error: data.error });
                } else {
                    // Don't save session on registration - user must log in
                    resolve({
                        username: data.username,
                        registered: true
                    });
                }
            } catch (e) {
                this._requestInProgress = false;
                reject({ error: e.message || "Registration failed" });
            }
        });
    };

    AuthManager.loginAsGuest = function() {
        this._token = null;
        this._userId = "guest_" + Date.now();
        this._username = "Guest";
        this._isGuest = true;
        this.saveSession();
    };

    AuthManager.logout = function() {
        this.clearSession();
    };


    window.AuthManager = AuthManager;

    //-----------------------------------------------------------------------------
    // Scene_Login
    // The scene class for the login screen.

    function Scene_Login() {
        this.initialize(...arguments);
    }

    Scene_Login.prototype = Object.create(Scene_Base.prototype);
    Scene_Login.prototype.constructor = Scene_Login;

    Scene_Login.prototype.initialize = function() {
        Scene_Base.prototype.initialize.call(this);
        this._mode = "command";
        this._loginStep = "username";
        this._username = "";
        this._password = "";
    };

    Scene_Login.prototype.create = function() {
        Scene_Base.prototype.create.call(this);
        this.createBackground();
        this.createWindowLayer();
        this.createCommandWindow();
        this.createEditWindow();
        this.createInputWindow();
        this.createStatusWindow();
    };

    Scene_Login.prototype.start = function() {
        Scene_Base.prototype.start.call(this);
        this.startFadeIn(this.fadeSpeed(), false);
    };

    Scene_Login.prototype.createBackground = function() {
        this._backSprite = new Sprite(
            ImageManager.loadTitle1($dataSystem.title1Name)
        );
        this.addChild(this._backSprite);
        this.scaleSprite(this._backSprite);
        this.centerSprite(this._backSprite);
    };

    Scene_Login.prototype.scaleSprite = function(sprite) {
        const width = Graphics.boxWidth;
        const height = Graphics.boxHeight;
        const ratioX = width / sprite.bitmap.width;
        const ratioY = height / sprite.bitmap.height;
        const scale = Math.max(ratioX, ratioY);
        sprite.scale.x = scale;
        sprite.scale.y = scale;
    };

    Scene_Login.prototype.centerSprite = function(sprite) {
        sprite.x = Graphics.width / 2;
        sprite.y = Graphics.height / 2;
        sprite.anchor.x = 0.5;
        sprite.anchor.y = 0.5;
    };

    Scene_Login.prototype.createCommandWindow = function() {
        const rect = this.commandWindowRect();
        this._commandWindow = new Window_LoginCommand(rect);
        this._commandWindow.setHandler("login", this.commandLogin.bind(this));
        this._commandWindow.setHandler("register", this.commandRegister.bind(this));
        if (enableGuestMode) {
            this._commandWindow.setHandler("guest", this.commandGuest.bind(this));
        }
        this.addWindow(this._commandWindow);
    };

    Scene_Login.prototype.commandWindowRect = function() {
        const commandCount = enableGuestMode ? 3 : 2;
        const ww = 400;
        const wh = this.calcWindowHeight(commandCount, true);
        const wx = (Graphics.boxWidth - ww) / 2;
        const wy = (Graphics.boxHeight - wh) / 2;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Login.prototype.createEditWindow = function() {
        const rect = this.editWindowRect();
        this._editWindow = new Window_LoginEdit(rect);
        this._editWindow.hide();
        this.addWindow(this._editWindow);
    };

    Scene_Login.prototype.editWindowRect = function() {
        const inputWindowHeight = this.calcWindowHeight(9, true);
        const ww = 600;
        const wh = this.calcWindowHeight(4, false);
        const wx = (Graphics.boxWidth - ww) / 2;
        const wy = (Graphics.boxHeight - (wh + inputWindowHeight + 8)) / 2;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Login.prototype.createInputWindow = function() {
        const rect = this.inputWindowRect();
        this._inputWindow = new Window_LoginInput(rect);
        this._inputWindow.setEditWindow(this._editWindow);
        this._inputWindow.setHandler("ok", this.onInputOk.bind(this));
        this._inputWindow.setHandler("cancel", this.onInputCancel.bind(this));
        this._inputWindow.hide();
        this.addWindow(this._inputWindow);
    };

    Scene_Login.prototype.inputWindowRect = function() {
        const wx = this._editWindow.x;
        const wy = this._editWindow.y + this._editWindow.height + 8;
        const ww = this._editWindow.width;
        const wh = this.calcWindowHeight(9, true);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Login.prototype.createStatusWindow = function() {
        const rect = this.statusWindowRect();
        this._statusWindow = new Window_LoginStatus(rect);
        this._statusWindow.hide();
        this.addWindow(this._statusWindow);
    };

    Scene_Login.prototype.statusWindowRect = function() {
        const ww = 600;
        const wh = this.calcWindowHeight(2, false);
        const wx = (Graphics.boxWidth - ww) / 2;
        const wy = Graphics.boxHeight - wh - 96;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Login.prototype.commandLogin = function() {
        this._mode = "login";
        this._loginStep = "username";
        this._username = "";
        this._password = "";
        this._commandWindow.hide();
        this._editWindow.setup("Username:", "", 30);
        this._editWindow.show();
        this._inputWindow.show();
        this._inputWindow.activate();
    };

    Scene_Login.prototype.commandRegister = function() {
        this._mode = "register";
        this._loginStep = "username";
        this._username = "";
        this._password = "";
        this._commandWindow.hide();
        this._editWindow.setup("Username:", "", 30);
        this._editWindow.show();
        this._inputWindow.show();
        this._inputWindow.activate();
    };

    Scene_Login.prototype.commandGuest = function() {
        AuthManager.loginAsGuest();
        this.autoStartGame();
    };

    Scene_Login.prototype.onInputOk = function() {
        const text = this._editWindow.getText();

        if (this._loginStep === "username") {
            if (text.length < 3) {
                this._statusWindow.setText("Username must be at least 3 characters");
                this._statusWindow.show();
                SoundManager.playBuzzer();
                return;
            }
            this._username = text;
            this._loginStep = "password";
            this._editWindow.setup("Password:", "", 30, true);
            this._inputWindow.refresh();
            this._inputWindow.activate();
            this._statusWindow.hide();
        } else if (this._loginStep === "password") {
            if (text.length < 6) {
                this._statusWindow.setText("Password must be at least 6 characters");
                this._statusWindow.show();
                SoundManager.playBuzzer();
                return;
            }
            this._password = text;
            this.performAuthentication();
        }
    };

    Scene_Login.prototype.onInputCancel = function() {
        if (this._loginStep === "password") {
            this._loginStep = "username";
            this._password = "";
            this._editWindow.setup(
                "Username:",
                this._username,
                30
            );
            this._inputWindow.refresh();
            this._inputWindow.activate();
            this._statusWindow.hide();
        } else {
            this._mode = "command";
            this._username = "";
            this._password = "";
            this._editWindow.hide();
            this._inputWindow.hide();
            this._statusWindow.hide();
            this._commandWindow.show();
            this._commandWindow.activate();
        }
    };

    Scene_Login.prototype.performAuthentication = function() {
        this._inputWindow.deactivate();
        this._statusWindow.setText("Authenticating...");
        this._statusWindow.show();

        const promise = this._mode === "login"
            ? AuthManager.login(this._username, this._password)
            : AuthManager.register(this._username, this._password);

        promise
            .then(response => {
                SoundManager.playOk();

                // Handle registration differently - redirect to login
                if (this._mode === "register") {
                    this._statusWindow.setText("Registration successful! Please log in.");
                    setTimeout(() => {
                        // Switch to login mode
                        this._mode = "login";
                        this._loginStep = "username";
                        this._username = "";
                        this._password = "";
                        this._editWindow.setup("Username:", "", 30);
                        this._inputWindow.activate();
                    }, 1500);
                } else {
                    // Login mode - auto-load save or start new game
                    this._statusWindow.setText("Success! Loading game...");
                    setTimeout(() => {
                        this.autoStartGame();
                    }, 500);
                }
            })
            .catch(error => {
                SoundManager.playBuzzer();
                const message = error.error || "Authentication failed";
                this._statusWindow.setText(message);
                this._loginStep = "username";
                this._username = "";
                this._password = "";
                this._editWindow.setup(
                    "Username:",
                    "",
                    30
                );
                this._inputWindow.activate();
            });
    };

    Scene_Login.prototype.autoStartGame = function() {
        this.fadeOutAll();

        // Check if any save files exist
        if (DataManager.isAnySavefileExists()) {
            // Load the latest save file
            const savefileId = DataManager.latestSavefileId();
            if (savefileId > 0) {
                DataManager.loadGame(savefileId)
                    .then(() => {
                        SoundManager.playLoad();
                        Scene_Load.prototype.reloadMapIfUpdated.call(this);
                        SceneManager.goto(Scene_Map);
                    })
                    .catch(() => {
                        // If load fails, start new game
                        this.startNewGame();
                    });
            } else {
                // No valid save, start new game
                this.startNewGame();
            }
        } else {
            // No saves exist, start new game
            this.startNewGame();
        }
    };

    Scene_Login.prototype.startNewGame = function() {
        DataManager.setupNewGame();
        SceneManager.goto(Scene_Map);
    };

    Scene_Login.prototype.update = function() {
        Scene_Base.prototype.update.call(this);
    };

    window.Scene_Login = Scene_Login;

    //-----------------------------------------------------------------------------
    // Window_LoginCommand
    // Command window for login mode selection.

    function Window_LoginCommand() {
        this.initialize(...arguments);
    }

    Window_LoginCommand.prototype = Object.create(Window_Command.prototype);
    Window_LoginCommand.prototype.constructor = Window_LoginCommand;

    Window_LoginCommand.prototype.initialize = function(rect) {
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_LoginCommand.prototype.makeCommandList = function() {
        this.addCommand("Login", "login", true);
        this.addCommand("Register", "register", true);

        if (enableGuestMode) {
            this.addCommand("Guest Mode", "guest", true);
        }
    };

    //-----------------------------------------------------------------------------
    // Window_LoginEdit
    // Text input display window (shows what user is typing).

    function Window_LoginEdit() {
        this.initialize(...arguments);
    }

    Window_LoginEdit.prototype = Object.create(Window_Base.prototype);
    Window_LoginEdit.prototype.constructor = Window_LoginEdit;

    Window_LoginEdit.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._label = "";
        this._text = "";
        this._maxLength = 0;
        this._index = 0;
        this._passwordMode = false;
    };

    Window_LoginEdit.prototype.setup = function(label, text, maxLength, passwordMode = false) {
        this._label = label;
        this._text = text;
        this._maxLength = maxLength;
        this._index = text.length;
        this._passwordMode = passwordMode;
        this.refresh();
    };

    Window_LoginEdit.prototype.getText = function() {
        return this._text;
    };

    Window_LoginEdit.prototype.add = function(ch) {
        if (this._index < this._maxLength) {
            this._text += ch;
            this._index++;
            this.refresh();
            return true;
        }
        return false;
    };

    Window_LoginEdit.prototype.back = function() {
        if (this._index > 0) {
            this._index--;
            this._text = this._text.slice(0, this._index);
            this.refresh();
            return true;
        }
        return false;
    };

    Window_LoginEdit.prototype.refresh = function() {
        this.contents.clear();

        this.drawText(this._label, 0, 0, this.innerWidth);

        const displayText = this._passwordMode ? "*".repeat(this._text.length) : this._text;
        this.drawText(displayText, 0, this.lineHeight(), this.innerWidth);

        const cursorX = this.textWidth(displayText);
        const cursorY = this.lineHeight() * 2 - 4;
        this.contents.fillRect(cursorX, cursorY, 2, 2, ColorManager.normalColor());
    };

    //-----------------------------------------------------------------------------
    // Window_LoginInput
    // Keyboard character input window.

    function Window_LoginInput() {
        this.initialize(...arguments);
    }

    Window_LoginInput.prototype = Object.create(Window_Selectable.prototype);
    Window_LoginInput.prototype.constructor = Window_LoginInput;

    Window_LoginInput.TABLE = [
        "A","B","C","D","E","F","G","H","I","J",
        "K","L","M","N","O","P","Q","R","S","T",
        "U","V","W","X","Y","Z","@",".","","",
        "a","b","c","d","e","f","g","h","i","j",
        "k","l","m","n","o","p","q","r","s","t",
        "u","v","w","x","y","z","_","-","","",
        "0","1","2","3","4","5","6","7","8","9",
        "!","#","$","%","&","*","+","=","","",
        "","","","","","","","","OK","Back"
    ];

    Window_LoginInput.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._editWindow = null;
        this._index = 0;
        this._keyDownListener = null;
        this.setupKeyboardInput();
    };

    Window_LoginInput.prototype.setupKeyboardInput = function() {
        const self = this;
        this._keyDownListener = function(e) {
            if (!(SceneManager._scene instanceof Scene_Login)) return;
            if (!self._editWindow || !self.active || !self.visible) return;

            if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (self._editWindow.add(e.key)) {
                    SoundManager.playCursor();
                } else {
                    SoundManager.playBuzzer();
                }
                return;
            }

            switch (e.key) {
                case 'Backspace':
                    e.preventDefault();
                    if (self._editWindow.back()) {
                        SoundManager.playCancel();
                    } else {
                        SoundManager.playBuzzer();
                    }
                    break;
                case 'Enter':
                    e.preventDefault();
                    self.callOkHandler();
                    break;
                case 'Escape':
                    e.preventDefault();
                    self.callCancelHandler();
                    break;
            }
        };
        document.addEventListener('keydown', this._keyDownListener);
    };

    Window_LoginInput.prototype.destroy = function(options) {
        if (this._keyDownListener) {
            document.removeEventListener('keydown', this._keyDownListener);
            this._keyDownListener = null;
        }
        Window_Selectable.prototype.destroy.call(this, options);
    };

    Window_LoginInput.prototype.setEditWindow = function(editWindow) {
        this._editWindow = editWindow;
        this.refresh();
        this.updateCursor();
        this.activate();
    };

    Window_LoginInput.prototype.updateCursor = function() {
        const rect = this.itemRect(this._index);
        this.setCursorRect(rect.x, rect.y, rect.width, rect.height);
    };

    Window_LoginInput.prototype.maxCols = function() {
        return 10;
    };

    Window_LoginInput.prototype.maxItems = function() {
        return Window_LoginInput.TABLE.length;
    };

    Window_LoginInput.prototype.character = function() {
        return Window_LoginInput.TABLE[this._index];
    };

    Window_LoginInput.prototype.isOk = function() {
        return this.character() === "OK";
    };

    Window_LoginInput.prototype.isBack = function() {
        return this.character() === "Back";
    };

    Window_LoginInput.prototype.processOk = function() {
        if (this.isOk()) {
            this.callOkHandler();
        } else if (this.isBack()) {
            this.processBack();
        } else {
            const ch = this.character();
            if (ch && ch !== "") {
                if (this._editWindow.add(ch)) {
                    SoundManager.playOk();
                } else {
                    SoundManager.playBuzzer();
                }
            }
        }
    };

    Window_LoginInput.prototype.processBack = function() {
        if (this._editWindow.back()) {
            SoundManager.playCancel();
        } else {
            SoundManager.playBuzzer();
        }
    };

    Window_LoginInput.prototype.processCancel = function() {
        this.callCancelHandler();
    };

    Window_LoginInput.prototype.itemRect = function(index) {
        const maxCols = this.maxCols();
        const itemWidth = this.itemWidth();
        const itemHeight = this.itemHeight();
        const colSpacing = this.colSpacing();
        const rowSpacing = this.rowSpacing();
        const col = index % maxCols;
        const row = Math.floor(index / maxCols);
        const x = col * itemWidth + colSpacing / 2 - this.scrollBaseX();
        const y = row * itemHeight + rowSpacing / 2 - this.scrollBaseY();
        const width = itemWidth - colSpacing;
        const height = itemHeight - rowSpacing;
        return new Rectangle(x, y, width, height);
    };

    Window_LoginInput.prototype.drawItem = function(index) {
        const character = Window_LoginInput.TABLE[index];
        if (character && character !== "") {
            const rect = this.itemLineRect(index);
            this.drawText(character, rect.x, rect.y, rect.width, "center");
        }
    };

    //-----------------------------------------------------------------------------
    // Window_LoginStatus
    // Status/error message display window.

    function Window_LoginStatus() {
        this.initialize(...arguments);
    }

    Window_LoginStatus.prototype = Object.create(Window_Base.prototype);
    Window_LoginStatus.prototype.constructor = Window_LoginStatus;

    Window_LoginStatus.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._text = "";
    };

    Window_LoginStatus.prototype.setText = function(text) {
        this._text = text;
        this.refresh();
    };

    Window_LoginStatus.prototype.refresh = function() {
        this.contents.clear();
        this.drawText(this._text, 0, 0, this.innerWidth, "center");
    };

    //-----------------------------------------------------------------------------
    // Window_UserDisplay
    // Displays the current logged-in username in the corner.

    function Window_UserDisplay() {
        this.initialize(...arguments);
    }

    Window_UserDisplay.prototype = Object.create(Window_Base.prototype);
    Window_UserDisplay.prototype.constructor = Window_UserDisplay;

    Window_UserDisplay.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_UserDisplay.prototype.refresh = function() {
        this.contents.clear();
        const username = AuthManager.getUsername();
        if (username) {
            const displayText = AuthManager.isGuest() ? "Guest" : username;
            this.drawText(displayText, 0, 0, this.innerWidth, "left");
        }
    };

    //-----------------------------------------------------------------------------
    // Window_TitleCommand Override
    // Add logout option to title menu.

    const _Window_TitleCommand_makeCommandList = Window_TitleCommand.prototype.makeCommandList;
    Window_TitleCommand.prototype.makeCommandList = function() {
        _Window_TitleCommand_makeCommandList.call(this);
        this.addCommand("Logout", "logout");
    };

    //-----------------------------------------------------------------------------
    // Scene_Title Override
    // Add username display to title screen and logout functionality.

    const _Scene_Title_create = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function() {
        _Scene_Title_create.call(this);
        this.createUserDisplay();
    };

    Scene_Title.prototype.createUserDisplay = function() {
        const width = 200;
        const height = this.calcWindowHeight(1, false);
        const x = Graphics.boxWidth - width - 10;
        const y = 10;
        const rect = new Rectangle(x, y, width, height);
        this._userDisplayWindow = new Window_UserDisplay(rect);
        this._userDisplayWindow.opacity = 180;
        this.addWindow(this._userDisplayWindow);
    };

    const _Scene_Title_createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function() {
        _Scene_Title_createCommandWindow.call(this);
        this._commandWindow.setHandler("logout", this.commandLogout.bind(this));
    };

    const _Scene_Title_commandWindowRect = Scene_Title.prototype.commandWindowRect;
    Scene_Title.prototype.commandWindowRect = function() {
        const offsetX = $dataSystem.titleCommandWindow.offsetX;
        const offsetY = $dataSystem.titleCommandWindow.offsetY;
        const ww = this.mainCommandWidth();
        const wh = this.calcWindowHeight(4, true); // Changed from 3 to 4 for logout option
        const wx = (Graphics.boxWidth - ww) / 2 + offsetX;
        const wy = Graphics.boxHeight - wh - 96 + offsetY;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Title.prototype.commandLogout = function() {
        this._commandWindow.close();
        AuthManager.logout();
        this.fadeOutAll();
        SceneManager.goto(Scene_Login);
    };

    //-----------------------------------------------------------------------------
    // Scene_Map Override
    // Add username display during gameplay.

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        this.createUserDisplay();
    };

    Scene_Map.prototype.createUserDisplay = function() {
        const width = 200;
        const height = this.calcWindowHeight(1, false);
        const x = Graphics.boxWidth - width - 10;
        const y = 10;
        const rect = new Rectangle(x, y, width, height);
        this._userDisplayWindow = new Window_UserDisplay(rect);
        this._userDisplayWindow.opacity = 180;
        this.addWindow(this._userDisplayWindow);
    };

    //-----------------------------------------------------------------------------
    // Scene_Boot Override
    // Always redirect to login screen on game start.

    const _Scene_Boot_startNormalGame = Scene_Boot.prototype.startNormalGame;
    Scene_Boot.prototype.startNormalGame = function() {
        this.checkPlayerLocation();
        DataManager.setupNewGame();
        Window_TitleCommand.initCommandPosition();

        AuthManager.initialize();

        // Always require login
        SceneManager.goto(Scene_Login);
    };

})();
