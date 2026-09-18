//=============================================================================
// ChatSystem.js
// Global Chat System for RPG Maker MZ
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Global chat functionality with message posting and replies
 * @author Your Name
 * @url
 *
 * @param enableChatMenu
 * @text Enable Chat Menu
 * @desc Show chat option in the menu
 * @type boolean
 * @default true
 *
 * @param chatCommand
 * @text Chat Command
 * @desc Text displayed in menu for chat
 * @type string
 * @default Chat
 *
 * @param maxMessagesPerPage
 * @text Messages Per Page
 * @desc Maximum messages to load per request
 * @type number
 * @default 50
 * @min 10
 * @max 200
 *
 * @command openChat
 * @text Open Chat Scene
 * @desc Open the global chat scene
 *
 * @command toggleChatOverlay
 * @text Toggle Chat Overlay
 * @desc Show/hide a chat overlay
 *
 * @help
 * ChatSystem.js
 * 
 * This plugin adds a global chat system to your RPG Maker MZ game.
 * 
 * Features:
 * - Post messages to global chat
 * - Reply to other player messages
 * - Message history
 * - User identification
 * - Real-time message updates
 * 
 * Usage:
 * Call the "openChat" command to open the chat scene.
 * Or use the menu option if enabled.
 * 
 * Script calls:
 * SceneManager.push(Scene_Chat);  // Open chat
 * 
 * Requirements:
 * - LoginSystem.js (for user authentication)
 * - Supabase database with chat tables setup
 */

(() => {
    const pluginName = "ChatSystem";
    const parameters = PluginManager.parameters(pluginName);
    const enableChatMenu = String(parameters['enableChatMenu'] || 'true') === 'true';
    const chatCommand = String(parameters['chatCommand'] || 'Chat');
    const maxMessagesPerPage = Number(parameters['maxMessagesPerPage'] || 50);

    // Initialize ChatDataManager when the scene is ready
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        ChatDataManager.initialize();
    };

    // Register the openChat command
    PluginManager.registerCommand(pluginName, "openChat", function(args) {
        SceneManager.push(Scene_Chat);
    });

    // Add chat option to menu if enabled
    if (enableChatMenu) {
        const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
        Window_MenuCommand.prototype.addOriginalCommands = function() {
            _Window_MenuCommand_addOriginalCommands.call(this);
            this.addCommand(chatCommand, "chat", this.areMainCommandsEnabled());
        };

        const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
        Scene_Menu.prototype.createCommandWindow = function() {
            _Scene_Menu_createCommandWindow.call(this);
            this._commandWindow.setHandler("chat", this.commandChat.bind(this));
        };

        Scene_Menu.prototype.commandChat = function() {
            SceneManager.push(Scene_Chat);
        };
    }

    // Add chat shortcut (Ctrl+C to open chat)
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);

        // You can use any key combination here
        // This example uses Control key + 'c' 
        // Adjust based on your preference
        if (Input.isTriggered('chat')) {
            SceneManager.push(Scene_Chat);
        }
    };

    // Store max messages setting
    window.CHAT_MAX_MESSAGES = maxMessagesPerPage;

})();
