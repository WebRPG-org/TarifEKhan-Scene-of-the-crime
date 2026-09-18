//=============================================================================
// Scene_Chat.js
// Main chat scene for RPG Maker MZ
//=============================================================================

//-----------------------------------------------------------------------------
// Window_ChatAction
// Popup command menu that appears when the player selects a message.
//-----------------------------------------------------------------------------

function Window_ChatAction() {
    this.initialize.apply(this, arguments);
}

Window_ChatAction.prototype = Object.create(Window_Command.prototype);
Window_ChatAction.prototype.constructor = Window_ChatAction;

Window_ChatAction.prototype.initialize = function(rect) {
    this._isOwnMessage = false;
    Window_Command.prototype.initialize.call(this, rect);
};

Window_ChatAction.prototype.setupForMessage = function(message) {
    this._isOwnMessage = message.user_id === AuthManager.getUserId();
    this.refresh();
    this.select(0);
};

Window_ChatAction.prototype.makeCommandList = function() {
    this.addCommand("Reply",  "reply",  true);
    this.addCommand("Edit",   "edit",   this._isOwnMessage);
    this.addCommand("Delete", "delete", this._isOwnMessage);
    this.addCommand("Cancel", "cancel", true);
};

//-----------------------------------------------------------------------------
// Scene_Chat
//-----------------------------------------------------------------------------

function Scene_Chat() {
    this.initialize.apply(this, arguments);
}

Scene_Chat.prototype = Object.create(Scene_MenuBase.prototype);
Scene_Chat.prototype.constructor = Scene_Chat;

Scene_Chat.prototype.initialize = function() {
    Scene_MenuBase.prototype.initialize.call(this);
    this.isLoadingMessages = false;
    this.autoRefreshTimer = 0;
    this.autoRefreshInterval = 300; // 5 seconds at 60fps
    this.replyingToMessage = null;
    this._editingMessageId = null;
    this._actionTargetMessage = null;
};

Scene_Chat.prototype.create = function() {
    Scene_MenuBase.prototype.create.call(this);
    this.createHelpWindow();
    this.createChatWindow();
    this.createInputWindow();
    this.createActionWindow();
    this.refreshMessages();
};

Scene_Chat.prototype.createHelpWindow = function() {
    const rect = new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false));
    this._helpWindow = new Window_Help(rect);
    this._helpWindow.setText("Global Chat");
    this.addWindow(this._helpWindow);
};

Scene_Chat.prototype.createChatWindow = function() {
    const wx = 0;
    const wy = this._helpWindow.height;
    const ww = Graphics.boxWidth;
    const inputHeight = this.calcWindowHeight(5, false);
    const wh = Graphics.boxHeight - wy - inputHeight;

    const rect = new Rectangle(wx, wy, ww, wh);
    this._chatWindow = new Window_ChatMessage(rect);
    this._chatWindow.setBackgroundType(0);
    this._chatWindow.setSceneChat(this);
    this._chatWindow.setHandler('ok', this.onChatMessageOk.bind(this));
    this.addWindow(this._chatWindow);
};

Scene_Chat.prototype.createInputWindow = function() {
    const wx = 0;
    const inputHeight = this.calcWindowHeight(5, false);
    const wy = Graphics.boxHeight - inputHeight;
    const ww = Graphics.boxWidth;
    const wh = inputHeight;

    const rect = new Rectangle(wx, wy, ww, wh);
    this._inputWindow = new Window_ChatInput(rect);
    this._inputWindow.setBackgroundType(0);
    this._inputWindow.setSceneChat(this);
    this._inputWindow.open();
    this._inputWindow.activate();
    this.addWindow(this._inputWindow);
};

Scene_Chat.prototype.createActionWindow = function() {
    const ww = 200;
    const wh = this.calcWindowHeight(4, true);
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    this._actionWindow = new Window_ChatAction(new Rectangle(wx, wy, ww, wh));
    this._actionWindow.setHandler("reply",  this.onActionReply.bind(this));
    this._actionWindow.setHandler("edit",   this.onActionEdit.bind(this));
    this._actionWindow.setHandler("delete", this.onActionDelete.bind(this));
    this._actionWindow.setHandler("cancel", this.onActionCancel.bind(this));
    this._actionWindow.hide();
    this._actionWindow.deactivate();
    this.addWindow(this._actionWindow);
};

Scene_Chat.prototype.start = function() {
    Scene_MenuBase.prototype.start.call(this);
};

Scene_Chat.prototype.update = function() {
    Scene_MenuBase.prototype.update.call(this);

    // Auto-refresh (skip while action menu is open)
    if (!this._actionWindow.visible) {
        this.autoRefreshTimer++;
        if (this.autoRefreshTimer >= this.autoRefreshInterval) {
            this.autoRefreshTimer = 0;
            this.refreshMessages();
        }
    }

    // Escape closes the scene only when the action menu is not open
    if (Input.isTriggered('cancel') && !this._actionWindow.visible) {
        this.popScene();
    }

    // Refresh the input window each frame so the cursor blinks
    if (this._inputWindow) {
        this._inputWindow.refresh();
    }
};

Scene_Chat.prototype.refreshMessages = async function() {
    if (this.isLoadingMessages) return;

    this.isLoadingMessages = true;
    const messages = await ChatDataManager.fetchMessages(50);
    if (this._chatWindow) {
        this._chatWindow.setMessages(messages);
    }
    this.isLoadingMessages = false;
};

Scene_Chat.prototype.postMessage = async function(content) {
    if (!content || !content.trim()) {
        SoundManager.playBuzzer();
        return;
    }

    if (AuthManager.isGuest()) {
        if (this._helpWindow) {
            this._helpWindow.setText("Guests cannot post. Please log in first.");
        }
        SoundManager.playBuzzer();
        return;
    }

    SoundManager.playCursor();

    if (this._editingMessageId) {
        const updated = await ChatDataManager.updateMessage(this._editingMessageId, content);
        this._editingMessageId = null;
        if (updated) {
            if (this._inputWindow) this._inputWindow.clear();
            if (this._helpWindow) this._helpWindow.setText("Global Chat");
            this.refreshMessages();
        } else {
            const reason = ChatDataManager._lastPostError || "Unknown error";
            if (this._helpWindow) this._helpWindow.setText("Edit failed: " + reason);
            SoundManager.playBuzzer();
        }
    } else {
        const parentId = this.replyingToMessage ? this.replyingToMessage.id : null;
        const message = await ChatDataManager.postMessage(content, parentId);
        if (message) {
            this.replyingToMessage = null;
            if (this._inputWindow) this._inputWindow.clear();
            if (this._helpWindow) this._helpWindow.setText("Global Chat");
            this.refreshMessages();
        } else {
            const reason = ChatDataManager._lastPostError || "Unknown error";
            if (this._helpWindow) this._helpWindow.setText("Send failed: " + reason);
            SoundManager.playBuzzer();
        }
    }
};

Scene_Chat.prototype.deleteMessage = async function(messageId) {
    const success = await ChatDataManager.deleteMessage(messageId);
    if (success) {
        SoundManager.playCursor();
        // Remove from local display immediately — no waiting for a network round-trip.
        if (this._chatWindow) this._chatWindow.removeMessage(messageId);
        // Then sync with the server in the background to get a clean authoritative list.
        this.isLoadingMessages = false;
        this.autoRefreshTimer = 0;
        this.refreshMessages();
    } else {
        SoundManager.playBuzzer();
    }
};

Scene_Chat.prototype.replyToMessage = function(message) {
    this.replyingToMessage = message;
    if (this._inputWindow) {
        this._inputWindow.setReplyingTo(message);
        this._inputWindow.activate();
        this._inputWindow.select(0);
    }
};

Scene_Chat.prototype.cancelReply = function() {
    this.replyingToMessage = null;
    if (this._inputWindow) {
        this._inputWindow.setReplyingTo(null);
    }
};

// ── Action menu ──────────────────────────────────────────────────────────────

Scene_Chat.prototype.onChatMessageOk = function() {
    const index = this._chatWindow.index();
    const item = this._chatWindow._flatItems[index];
    const message = item ? item.message : null;
    if (message) {
        this.showMessageActions(message);
    } else {
        this._chatWindow.activate();
    }
};

Scene_Chat.prototype.showMessageActions = function(message) {
    this._actionTargetMessage = message;
    this._actionWindow.setupForMessage(message);
    this._actionWindow.show();
    this._actionWindow.activate();
    if (this._chatWindow)  this._chatWindow.deactivate();
    if (this._inputWindow) this._inputWindow.deactivate();
};

Scene_Chat.prototype._closeActionWindow = function() {
    this._actionWindow.hide();
    this._actionWindow.deactivate();
    this._actionTargetMessage = null;
    if (this._chatWindow)  this._chatWindow.activate();
    if (this._inputWindow) this._inputWindow.activate();
};

Scene_Chat.prototype.onActionReply = function() {
    const msg = this._actionTargetMessage;
    this._closeActionWindow();
    this.replyToMessage(msg);
};

Scene_Chat.prototype.onActionEdit = function() {
    const msg = this._actionTargetMessage;
    this._editingMessageId = msg.id;
    this._closeActionWindow();
    if (this._inputWindow) this._inputWindow.setEditingMessage(msg);
};

Scene_Chat.prototype.onActionDelete = async function() {
    const msg = this._actionTargetMessage;
    this._closeActionWindow();
    await this.deleteMessage(msg.id);
};

Scene_Chat.prototype.onActionCancel = function() {
    this._closeActionWindow();
};

// ─────────────────────────────────────────────────────────────────────────────

Scene_Chat.prototype.popScene = function() {
    SceneManager.pop();
};

Scene_Chat.prototype.terminate = function() {
    if (this._inputWindow) {
        this._inputWindow.close();
    }
    Scene_MenuBase.prototype.terminate.call(this);
};
