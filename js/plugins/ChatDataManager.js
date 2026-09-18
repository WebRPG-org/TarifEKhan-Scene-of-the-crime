//=============================================================================
// ChatDataManager.js
// Manages all chat data operations with Supabase
//=============================================================================

function ChatDataManager() {
    throw new Error("This is a static class");
}

ChatDataManager.supabase = null;
ChatDataManager.messagesCache = [];
ChatDataManager.isInitialized = false;

/**
 * Initialize the ChatDataManager with Supabase client.
 * Reuses the client from LoginSystem if already created, to avoid
 * duplicate client instances and auth token mismatches.
 */
ChatDataManager.initialize = function() {
    if (typeof window.supabase === 'undefined') {
        console.warn('Supabase not loaded. Chat functionality unavailable.');
        return false;
    }

    if (window._supabaseClient) {
        this.supabase = window._supabaseClient;
        this.isInitialized = true;
        console.log('ChatDataManager initialized (shared client)');
        return true;
    }

    const supabaseUrl = window.GAME_CONFIG?.SUPABASE_URL;
    const supabaseKey = window.GAME_CONFIG?.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.warn('Supabase config not found. Chat functionality unavailable.');
        return false;
    }

    this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    this.isInitialized = true;
    console.log('ChatDataManager initialized');
    return true;
};

/**
 * Check whether the current user can perform chat actions.
 * Guests (who have a userId but no token) are allowed to read
 * messages but NOT to post — postMessage guards against that below.
 */
ChatDataManager._canRead = function() {
    return this.isInitialized;
};

ChatDataManager._canWrite = function() {
    if (!this.isInitialized) return false;
    // Must be a real authenticated user (not guest) to post
    return AuthManager.isAuthenticated() && !AuthManager.isGuest();
};

/**
 * Fetch all chat messages with optional filters
 * @param {number} limit - Maximum number of messages to fetch
 * @param {UUID|null} parentMessageId - Optional parent message ID for threaded replies
 * @returns {Promise<Array>}
 */
ChatDataManager.fetchMessages = async function(limit = 50, parentMessageId = null) {
    if (!this._canRead()) return [];

    try {
        let query = this.supabase
            .from('chat_messages')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (parentMessageId) {
            query = query.eq('parent_message_id', parentMessageId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching messages:', error);
            return [];
        }

        // Reverse to get chronological order (oldest first)
        this.messagesCache = data ? data.reverse() : [];
        return this.messagesCache;
    } catch (error) {
        console.error('Exception fetching messages:', error);
        return [];
    }
};

/**
 * Fetch replies to a specific message
 * @param {UUID} parentMessageId - The parent message ID
 * @returns {Promise<Array>}
 */
ChatDataManager.fetchReplies = async function(parentMessageId) {
    if (!this._canRead() || !parentMessageId) return [];

    try {
        const { data, error } = await this.supabase
            .from('chat_messages')
            .select('*')
            .eq('parent_message_id', parentMessageId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching replies:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Exception fetching replies:', error);
        return [];
    }
};

/**
 * Post a new chat message.
 * Guests cannot post — they must be logged in with a real account.
 * @param {string} content - The message content
 * @param {UUID|null} parentMessageId - Optional parent message ID for replies
 * @returns {Promise<Object|null>}
 */
ChatDataManager.postMessage = async function(content, parentMessageId = null) {
    if (!this.isInitialized) {
        console.warn('ChatDataManager not initialized');
        return null;
    }

    // ── FIX: distinguish between "not logged in" and "logged in as guest" ──
    if (!AuthManager.isAuthenticated()) {
        console.warn('User not authenticated');
        return null;
    }

    if (AuthManager.isGuest()) {
        console.warn('Guests cannot post messages. Please log in.');
        return null;
    }
    // ────────────────────────────────────────────────────────────────────────

    try {
        const messageData = {
            user_id: AuthManager.getUserId(),
            username: AuthManager.getUsername(),
            content: content.trim(),
            parent_message_id: parentMessageId || null
        };

        const { data, error } = await this.supabase
            .from('chat_messages')
            .insert([messageData])
            .select();

        if (error) {
            console.error('Error posting message:', error.message, '| code:', error.code, '| hint:', error.hint);
            ChatDataManager._lastPostError = error.message;
            return null;
        }

        ChatDataManager._lastPostError = null;
        return data ? data[0] : null;
    } catch (error) {
        console.error('Exception posting message:', error);
        ChatDataManager._lastPostError = error.message;
        return null;
    }
};

/**
 * Delete a message (soft delete by setting deleted_at timestamp).
 * Only the message author can delete their own messages.
 * @param {UUID} messageId - The message ID to delete
 * @returns {Promise<boolean>}
 */
ChatDataManager.deleteMessage = async function(messageId) {
    if (!this._canWrite()) {
        console.warn('Cannot delete: not authenticated or is a guest.');
        return false;
    }

    try {
        // Use a SECURITY DEFINER RPC so the delete bypasses RLS entirely.
        // The function enforces ownership (user_id check) on the server side.
        const { data, error } = await this.supabase.rpc('delete_chat_message', {
            p_message_id: messageId,
            p_user_id:    AuthManager.getUserId()
        });

        if (error) {
            console.error('Delete RPC error:', error);
            return false;
        }

        if (data !== true) {
            console.warn('Delete matched no rows — message not found or wrong owner.');
            return false;
        }

        return true;
    } catch (error) {
        console.error('Delete exception:', error);
        return false;
    }
};

/**
 * Update a message's content.
 * Only the message author can edit their own messages.
 * @param {UUID} messageId - The message ID to update
 * @param {string} content - The new message content
 * @returns {Promise<Object|null>}
 */
ChatDataManager.updateMessage = async function(messageId, content) {
    if (!this._canWrite()) {
        console.warn('Cannot update: user not authenticated or is a guest.');
        return null;
    }

    try {
        const { data, error } = await this.supabase
            .from('chat_messages')
            .update({ content: content.trim(), updated_at: new Date().toISOString() })
            .eq('id', messageId)
            .select();

        if (error) {
            console.error('Error updating message:', error);
            return null;
        }

        return data ? data[0] : null;
    } catch (error) {
        console.error('Exception updating message:', error);
        return null;
    }
};

/**
 * Get cached messages without a network call.
 * @returns {Array}
 */
ChatDataManager.getCachedMessages = function() {
    return this.messagesCache;
};

/**
 * Clear the local message cache.
 */
ChatDataManager.clearCache = function() {
    this.messagesCache = [];
};
