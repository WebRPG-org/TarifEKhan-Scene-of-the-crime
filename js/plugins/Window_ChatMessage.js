//=============================================================================
// Window_ChatMessage.js
// Displays chat messages in a scrollable list with dynamic heights and
// threaded replies grouped directly below their parent message.
//=============================================================================

function Window_ChatMessage(rect) {
    this.initialize.apply(this, arguments);
}

Window_ChatMessage.prototype = Object.create(Window_Selectable.prototype);
Window_ChatMessage.prototype.constructor = Window_ChatMessage;

Window_ChatMessage.prototype.initialize = function(rect) {
    Window_Selectable.prototype.initialize.call(this, rect);
    this._messages    = [];   // raw flat array from Supabase
    this._flatItems   = [];   // {message, isReply} in threaded display order
    this._computedHeights = []; // pixel height of each flat item
    this._yOffsets    = [];   // cumulative y start of each flat item
    this._sceneChat   = null;
    this.select(0);
    // Window_Selectable.initialize ends with deactivate(); re-activate for clicks/scroll.
    this.activate();
};

Window_ChatMessage.prototype.setSceneChat = function(sceneChat) {
    this._sceneChat = sceneChat;
};

//-----------------------------------------------------------------------------
// Message loading
//-----------------------------------------------------------------------------

Window_ChatMessage.prototype.setMessages = function(messages) {
    const isFirstLoad = this._messages.length === 0;
    const prevScrollY = this.scrollY();
    const maxPrev     = Math.max(0, this.overallHeight() - this.innerHeight);
    const wasAtBottom = prevScrollY >= maxPrev - 5;

    this._messages = messages;
    this._rebuildLayout();
    this.refresh(); // createContents() (correct size) + drawAllItems()

    if (isFirstLoad || wasAtBottom) {
        this.scrollTo(0, this.overallHeight());
    } else {
        this.scrollTo(0, prevScrollY);
    }
};

//-----------------------------------------------------------------------------
// Layout computation
//-----------------------------------------------------------------------------

Window_ChatMessage.prototype._rebuildLayout = function() {
    // ── Group messages: parents first, replies map by parent id ──────────────
    const parents = [];
    const repliesByParent = {};

    for (const msg of this._messages) {
        if (msg.parent_message_id) {
            if (!repliesByParent[msg.parent_message_id]) {
                repliesByParent[msg.parent_message_id] = [];
            }
            repliesByParent[msg.parent_message_id].push(msg);
        } else {
            parents.push(msg);
        }
    }

    for (const parentId in repliesByParent) {
        repliesByParent[parentId].sort(
            (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
    }

    // ── Build flat display order: parent → its replies → next parent → … ─────
    const parentIdSet = new Set(parents.map(m => m.id));
    this._flatItems = [];

    for (const parent of parents) {
        this._flatItems.push({ message: parent, isReply: false });
        for (const reply of (repliesByParent[parent.id] || [])) {
            this._flatItems.push({ message: reply, isReply: true });
        }
    }
    // Orphaned replies (parent outside the fetch window or deleted)
    for (const parentId in repliesByParent) {
        if (!parentIdSet.has(parentId)) {
            for (const reply of repliesByParent[parentId]) {
                this._flatItems.push({ message: reply, isReply: true });
            }
        }
    }

    // ── Pre-compute heights and cumulative y offsets ──────────────────────────
    this._computedHeights = [];
    this._yOffsets = [];

    // Set font size to match drawItem content rendering before measuring text.
    if (this.contents) this.contents.fontSize = 16;

    const lh      = this.lineHeight();
    const baseW   = this.innerWidth - 32; // innerWidth - colSpacing(8) - 24px margin

    let currentY = 0;
    for (const item of this._flatItems) {
        this._yOffsets.push(currentY);

        const indent  = item.isReply ? 32 : 0;
        const topPad  = item.isReply ? 8  : 0;
        const cw      = baseW - indent;

        const lines   = this.wrapText(item.message.content, cw);
        // header (username + timestamp row) + content lines + bottom pad
        const raw     = topPad + 28 + lines.length * (lh - 8) + 8;
        const height  = Math.max(raw, lh * 2);

        this._computedHeights.push(height);
        currentY += height;
    }
};

//-----------------------------------------------------------------------------
// Window_Selectable overrides — variable-height scroll system
//-----------------------------------------------------------------------------

Window_ChatMessage.prototype.maxItems = function() {
    return this._flatItems ? this._flatItems.length : 0;
};

// itemHeight() is intentionally NOT overridden — the base value (~44px) is used
// only as the scroll block size (how many pixels per paint() tick). The actual
// per-item heights come from _computedHeights via itemRect().

Window_ChatMessage.prototype.overallHeight = function() {
    if (!this._yOffsets || this._yOffsets.length === 0) return this.innerHeight;
    const last = this._yOffsets.length - 1;
    return this._yOffsets[last] + this._computedHeights[last];
};

Window_ChatMessage.prototype.contentsHeight = function() {
    return Math.max(this.innerHeight, this.overallHeight());
};

Window_ChatMessage.prototype.itemRect = function(index) {
    if (!this._yOffsets || index < 0 || index >= this._yOffsets.length) {
        return new Rectangle(0, -9999, this.innerWidth - 8, 36);
    }
    const x = this.colSpacing() / 2 - this.scrollBaseX();
    const y = this._yOffsets[index] - this.scrollBaseY();
    const w = this.innerWidth - this.colSpacing();
    const h = this._computedHeights[index];
    return new Rectangle(x, y, w, h);
};

// Draw every item on each paint; items outside the viewport are clipped.
Window_ChatMessage.prototype.topIndex = function() { return 0; };
Window_ChatMessage.prototype.maxVisibleItems = function() { return this.maxItems(); };

Window_ChatMessage.prototype.drawAllItems = function() {
    const count = this.maxItems();
    for (let i = 0; i < count; i++) {
        this.drawItem(i);
    }
};

Window_ChatMessage.prototype.hitTest = function(x, y) {
    if (!this.innerRect.contains(x, y)) return -1;
    // innerY is position within the visible area (view space).
    // itemRect(i).y = _yOffsets[i] - scrollBaseY() is also in view space.
    const innerY = this.origin.y + y - this.padding;
    for (let i = 0; i < this._flatItems.length; i++) {
        const itemY = this._yOffsets[i] - this.scrollBaseY();
        if (innerY >= itemY && innerY < itemY + this._computedHeights[i]) {
            return i;
        }
    }
    return -1;
};

Window_ChatMessage.prototype.ensureCursorVisible = function(smooth) {
    const index = this.index();
    if (index < 0 || !this._yOffsets || index >= this._yOffsets.length) return;
    const itemTop    = this._yOffsets[index];
    const itemBottom = itemTop + this._computedHeights[index];
    const scrollY    = this.scrollY();
    const scrollMin  = itemBottom - this.innerHeight;
    if (scrollY > itemTop) {
        smooth ? this.smoothScrollTo(0, itemTop) : this.scrollTo(0, itemTop);
    } else if (scrollY < scrollMin) {
        smooth ? this.smoothScrollTo(0, scrollMin) : this.scrollTo(0, scrollMin);
    }
};

//-----------------------------------------------------------------------------
// Drawing
//-----------------------------------------------------------------------------

Window_ChatMessage.prototype.drawItem = function(index) {
    if (!this._flatItems || index >= this._flatItems.length) return;
    const item = this._flatItems[index];
    if (!item) return;

    const message  = item.message;
    const isReply  = item.isReply;
    const rect     = this.itemRect(index);
    const lh       = this.lineHeight();

    const indent = isReply ? 32 : 0;
    const topPad = isReply ? 8  : 0;

    // Blue left bar for replies
    if (isReply) {
        this.contents.fillRect(rect.x + 2, rect.y + topPad, 4,
            rect.height - topPad - 4, '#4488dd');
    }

    // Message box background
    this.contents.fillRect(
        rect.x + indent, rect.y + topPad,
        rect.width - indent - 4, rect.height - topPad - 2,
        this.getMessageColor(message)
    );

    // Username
    this.contents.fontSize = 18;
    this.changeTextColor(ColorManager.textColor(7));
    this.drawText(message.username, rect.x + indent + 12, rect.y + topPad + 4, 200);

    // Timestamp
    this.contents.fontSize = 14;
    this.changeTextColor(ColorManager.textColor(7));
    this.drawText(
        this.formatTime(message.created_at),
        rect.x + rect.width - 140, rect.y + topPad + 6,
        120, 'right'
    );

    // Message content (wrapped)
    const contentWidth = rect.width - indent - 24;
    this.contents.fontSize = 16;
    this.changeTextColor(ColorManager.normalColor());
    const wrappedText = this.wrapText(message.content, contentWidth);
    let yOffset = rect.y + topPad + 28;
    for (const line of wrappedText) {
        this.drawText(line, rect.x + indent + 12, yOffset, contentWidth);
        yOffset += lh - 8;
    }

    this.resetTextColor();
};

Window_ChatMessage.prototype.getMessageColor = function(message) {
    if (message.user_id === AuthManager.getUserId()) {
        return 0x1a4d1a; // green-tinted for own messages
    }
    return 0x1a1a2e; // dark blue for other messages
};

//-----------------------------------------------------------------------------
// Text helpers
//-----------------------------------------------------------------------------

Window_ChatMessage.prototype.wrapText = function(text, maxWidth) {
    const lines = [];
    const words = (text || '').split(' ');
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        if (this.textWidth(testLine) > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [text];
};

Window_ChatMessage.prototype.formatTime = function(isoString) {
    try {
        const date    = new Date(isoString);
        const diffMs  = Date.now() - date;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1)    return "Just now";
        if (diffMin < 60)   return diffMin + "m ago";
        if (diffMin < 1440) return Math.floor(diffMin / 60) + "h ago";
        return date.toLocaleDateString();
    } catch (e) {
        return "";
    }
};

//-----------------------------------------------------------------------------
// Input handling
//-----------------------------------------------------------------------------

// Block keyboard OK (Enter/Z) — Enter is handled by Window_ChatInput's DOM listener.
Window_ChatMessage.prototype.isOkTriggered = function() {
    return false;
};

// Single-click opens the action menu (no double-click required).
Window_ChatMessage.prototype.onTouchSelect = function(trigger) {
    if (!this.isCursorMovable()) return;
    const touchPos = new Point(TouchInput.x, TouchInput.y);
    const localPos = this.worldTransform.applyInverse(touchPos);
    const index = this.hitTest(localPos.x, localPos.y);
    if (index >= 0) {
        this.select(index);
        if (trigger) this.processOk();
    }
};

Window_ChatMessage.prototype.processCancel = function() {
    // Escape handled at scene level (popScene).
};

//-----------------------------------------------------------------------------
// Refresh
//-----------------------------------------------------------------------------

// Immediately removes a message by id from the local cache and redraws.
// Called right after a successful delete so the UI updates without waiting
// for the next network refresh.
Window_ChatMessage.prototype.removeMessage = function(messageId) {
    this._messages = this._messages.filter(m => m.id !== messageId);
    this._rebuildLayout();
    this.refresh();
};

Window_ChatMessage.prototype.refresh = function() {
    this.createContents(); // bitmap sized to contentsHeight() = overallHeight()
    this.drawAllItems();
};
