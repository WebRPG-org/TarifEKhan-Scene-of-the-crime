//=============================================================================
// Window_ChatInput.js
// Input window for typing and sending chat messages
//=============================================================================

function Window_ChatInput(rect) {
    this.initialize.apply(this, arguments);
}

Window_ChatInput.prototype = Object.create(Window_Selectable.prototype);
Window_ChatInput.prototype.constructor = Window_ChatInput;

Window_ChatInput.prototype.initialize = function(rect) {
    Window_Selectable.prototype.initialize.call(this, rect);
    this._sceneChat = null;
    this._inputText = '';
    this._inputBuffer = '';
    this._replyingTo = null;
    this._editingMessage = null;
    this._cursorPosition = 0;
    this._canSend = true;
    this._sendCooldown = 0;
    this._maxMessageLength = 500;
    this._maxChars = this._maxMessageLength;
    this._keyDownListener = null;
    this.select(0);
    this.activate();
    this.setupKeyboardInput();
};

Window_ChatInput.prototype.setSceneChat = function(sceneChat) {
    this._sceneChat = sceneChat;
};

Window_ChatInput.prototype.setReplyingTo = function(message) {
    this._replyingTo = message;
    this.refresh();
};

Window_ChatInput.prototype.setEditingMessage = function(message) {
    this._editingMessage = message;
    this._inputText = message ? message.content : '';
    this._cursorPosition = this._inputText.length;
    this.refresh();
};

Window_ChatInput.prototype.setupKeyboardInput = function() {
    const self = this;

    // Remove old listener if it exists (prevents duplicate handlers on re-create)
    if (this._keyDownListener) {
        document.removeEventListener('keydown', this._keyDownListener);
    }

    this._keyDownListener = function(e) {
        // Only handle input when the Chat scene is active
        if (!(SceneManager._scene instanceof Scene_Chat)) return;

        const inputWindow = SceneManager._scene._inputWindow;
        if (!inputWindow || inputWindow !== self) return;

        // ── FIX: guests cannot type; swallow keystrokes silently ──
        if (AuthManager.isGuest()) return;

        // Printable character
        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            self.addCharacter(e.key);
            return;
        }

        switch (e.key) {
            case 'Backspace':
                e.preventDefault();
                self.backspace();
                break;
            case 'Enter':
                e.preventDefault();
                self.sendMessage();
                break;
            case 'Shift':
                if (self._replyingTo && self._sceneChat) {
                    e.preventDefault();
                    self._sceneChat.cancelReply();
                    self._replyingTo = null;
                    self.refresh();
                } else if (self._editingMessage && self._sceneChat) {
                    e.preventDefault();
                    self._editingMessage = null;
                    self._inputText = '';
                    self._cursorPosition = 0;
                    self._sceneChat._editingMessageId = null;
                    self.refresh();
                }
                break;
        }
    };

    document.addEventListener('keydown', this._keyDownListener);
};

Window_ChatInput.prototype.maxItems = function() {
    return 1;
};

Window_ChatInput.prototype.itemHeight = function() {
    return this.innerHeight;
};

Window_ChatInput.prototype.update = function() {
    Window_Selectable.prototype.update.call(this);

    if (this._sendCooldown > 0) {
        this._sendCooldown--;
        this._canSend = this._sendCooldown <= 0;
    }
};

Window_ChatInput.prototype.addCharacter = function(char) {
    if (this._inputText.length < this._maxChars) {
        this._inputText += char;
        this._cursorPosition = this._inputText.length;
        this.refresh();
        SoundManager.playCursor();
    }
};

Window_ChatInput.prototype.backspace = function() {
    if (this._inputText.length > 0) {
        this._inputText = this._inputText.slice(0, -1);
        this._cursorPosition = this._inputText.length;
        this.refresh();
        SoundManager.playCancel();
    }
};

Window_ChatInput.prototype.clear = function() {
    this._inputText = '';
    this._cursorPosition = 0;
    this._replyingTo = null;
    this._editingMessage = null;
    this.refresh();
};

Window_ChatInput.prototype.sendMessage = function() {
    // ── FIX: explicit guest guard with feedback ──
    if (AuthManager.isGuest()) {
        SoundManager.playBuzzer();
        return;
    }

    if (!AuthManager.isAuthenticated()) {
        SoundManager.playBuzzer();
        return;
    }

    if (!this._canSend) {
        SoundManager.playBuzzer();
        return;
    }

    if (!this._inputText.trim()) {
        SoundManager.playBuzzer();
        return;
    }

    // Apply cooldown (2 seconds = 120 frames at 60fps)
    this._sendCooldown = 120;
    this._canSend = false;

    if (this._sceneChat) {
        this._sceneChat.postMessage(this._inputText);
    }

    this.clear();
};

Window_ChatInput.prototype.drawItem = function(index) {
    this.contents.fillRect(0, 0, this.innerWidth, this.innerHeight, 0x000000);

    const isGuest = AuthManager.isGuest();

    // Context banner (reply or edit)
    if (this._replyingTo) {
        this.contents.fontSize = 14;
        this.changeTextColor(ColorManager.textColor(14));
        this.drawText("Replying to: " + this._replyingTo.username, 8, 4, this.innerWidth - 16);
        const snippet = this._replyingTo.content.length > 50
            ? this._replyingTo.content.substring(0, 50) + "..."
            : this._replyingTo.content;
        this.drawText(snippet, 8, 22, this.innerWidth - 16);
        this.changeTextColor(ColorManager.textColor(3));
        this.drawText("[Shift] to cancel", this.innerWidth - 140, 4, 130, 'right');
    } else if (this._editingMessage) {
        this.contents.fontSize = 14;
        this.changeTextColor(ColorManager.textColor(6));
        this.drawText("Editing message", 8, 4, this.innerWidth - 16);
        this.changeTextColor(ColorManager.textColor(3));
        this.drawText("[Shift] to cancel", this.innerWidth - 140, 4, 130, 'right');
    }

    const yOffset = (this._replyingTo || this._editingMessage) ? 44 : 8;

    // "Message:" label
    this.contents.fontSize = 16;
    this.changeTextColor(ColorManager.textColor(24));
    this.drawText("Message:", 8, yOffset, 80);

    // Input box
    const inputY = yOffset + 24;
    this.contents.fillRect(8, inputY, this.innerWidth - 16, 32, 0x333333);
    this.contents.strokeRect(
        8, inputY, this.innerWidth - 16, 32,
        isGuest ? ColorManager.textColor(10) : ColorManager.textColor(6)
    );

    if (isGuest) {
        // Show a friendly message instead of an empty input box
        this.contents.fontSize = 14;
        this.changeTextColor(ColorManager.textColor(7));
        this.drawText("Log in to send messages", 12, inputY + 8, this.innerWidth - 24);
    } else {
        // Normal input display
        this.contents.fontSize = 14;
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(this._inputText, 12, inputY + 8, this.innerWidth - 80);

        // Blinking cursor (visible every other second)
        const cursorVisible = Math.floor(Date.now() / 500) % 2 === 0;
        if (cursorVisible) {
            const cursorX = 12 + this.textWidth(this._inputText);
            this.contents.fillRect(cursorX, inputY + 8, 2, 16, ColorManager.normalColor());
        }

        // Character counter
        this.contents.fontSize = 12;
        const atLimit = this._inputText.length >= this._maxChars;
        this.changeTextColor(ColorManager.textColor(atLimit ? 10 : 7));
        this.drawText(
            this._inputText.length + "/" + this._maxChars,
            this.innerWidth - 100, inputY + 8, 90, 'right'
        );
    }

    // Bottom hint row
    this.contents.fontSize = 12;
    this.changeTextColor(ColorManager.textColor(7));
    const hintY = inputY + 40;

    if (isGuest) {
        this.changeTextColor(ColorManager.textColor(10));
        this.drawText("Guest mode: read-only chat", 8, hintY, this.innerWidth - 16);
    } else {
        const shiftHint = this._editingMessage ? "Shift: Cancel Edit" : "Shift: Cancel Reply";
        this.drawText("Enter: Send  |  Backspace: Delete  |  " + shiftHint, 8, hintY, this.innerWidth - 16);

        if (!this._canSend) {
            this.changeTextColor(ColorManager.textColor(10));
            this.drawText(
                "Cooldown: " + Math.ceil(this._sendCooldown / 60) + "s",
                8, hintY + 18, 200
            );
        }
    }

    this.resetTextColor();
};

Window_ChatInput.prototype.refresh = function() {
    this.createContents();
    this.drawAllItems();
};

Window_ChatInput.prototype.close = function() {
    if (this._keyDownListener) {
        document.removeEventListener('keydown', this._keyDownListener);
        this._keyDownListener = null;
    }
    Window_Selectable.prototype.close.call(this);
};
