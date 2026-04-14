/* =======================================
   Venary — Ban Appeal Page
   Status tracker similar to Walmart order tracking
   ======================================= */
var AppealPage = {
    appealData: null,

    async render(container) {
        // Check if user is banned
        if (!App.currentUser || !App.currentUser.banned) {
            container.innerHTML = '<div class="empty-state"><h3>Not Banned</h3><p>Your account is not currently banned. If you believe this is an error, please contact support.</p></div>';
            return;
        }

        // Load appeal data
        container.innerHTML = '<div class="loading-spinner" style="margin: 40px auto;"></div>';

        try {
            this.appealData = await API.getMyAppeal();
            this.renderAppealPage(container);
        } catch (err) {
            container.innerHTML = '<div class="empty-state"><h3>Error</h3><p>Failed to load appeal data. Please try again.</p></div>';
        }
    },

    renderAppealPage(container) {
        const { banned, ban_reason, banned_until, active_appeal, cooldown_info } = this.appealData;

        let html = '<div class="appeal-container">';

        // Header
        html += '<div class="appeal-header">';
        html += '<h1><span class="appeal-icon">⚠️</span> Account Banned</h1>';
        html += '<p class="appeal-subtitle">Your account has been banned from the platform.</p>';
        html += '</div>';

        // Ban info card
        html += '<div class="appeal-ban-info">';
        html += '<div class="ban-info-row"><span class="ban-label">Reason:</span><span class="ban-value">' + App.escapeHtml(ban_reason || 'Violation of platform rules') + '</span></div>';
        if (banned_until) {
            const expiryDate = new Date(banned_until).toLocaleString();
            html += '<div class="ban-info-row"><span class="ban-label">Expires:</span><span class="ban-value">' + expiryDate + '</span></div>';
        } else {
            html += '<div class="ban-info-row"><span class="ban-label">Duration:</span><span class="ban-value permanent">Permanent</span></div>';
        }
        html += '</div>';

        // Status tracker (only show if there's an active appeal)
        if (active_appeal) {
            html += this.renderStatusTracker(active_appeal.status);
            html += this.renderActiveAppeal(active_appeal);
        } else if (cooldown_info && cooldown_info.days_remaining > 0) {
            // Cooldown period
            html += '<div class="appeal-cooldown">';
            html += '<div class="cooldown-icon">⏳</div>';
            html += '<h3>Appeal Cooldown</h3>';
            html += '<p>You must wait <strong>' + cooldown_info.days_remaining + ' day(s)</strong> before submitting a new appeal.</p>';
            html += '<p class="cooldown-date">You can submit again after: ' + new Date(cooldown_info.can_appeal_after).toLocaleString() + '</p>';
            html += '</div>';
        } else {
            // Appeal form
            html += this.renderAppealForm();
        }

        html += '</div>';
        container.innerHTML = html;
    },

    renderStatusTracker(status) {
        // Status flow: submitted -> under_review -> [approved | declined]
        const steps = [
            { id: 'submitted', label: 'Submitted' },
            { id: 'under_review', label: 'Under Review' },
            { id: 'decision', label: 'Decision' }
        ];

        let currentStepIndex = 0;
        if (status === 'under_review') currentStepIndex = 1;
        if (status === 'approved' || status === 'declined') currentStepIndex = 2;

        let html = '<div class="appeal-status-tracker">';
        html += '<h3>Appeal Status</h3>';
        html += '<div class="status-tracker">';

        steps.forEach((step, index) => {
            let stepClass = '';
            if (index < currentStepIndex) {
                stepClass = 'completed';
            } else if (index === currentStepIndex) {
                stepClass = 'active';
            }

            // For the decision step, use different colors based on outcome
            if (index === 2 && status === 'approved') {
                stepClass += ' approved';
            } else if (index === 2 && status === 'declined') {
                stepClass += ' declined';
            }

            html += '<div class="status-step ' + stepClass + '">';
            html += '<div class="status-dot">';
            if (index < currentStepIndex || (index === 2 && (status === 'approved' || status === 'declined'))) {
                html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            } else if (index === currentStepIndex) {
                html += '<div class="status-pulse"></div>';
            }
            html += '</div>';
            html += '<span class="status-label">' + step.label + '</span>';

            // Add status text under the decision step
            if (index === 2 && status === 'approved') {
                html += '<span class="status-result approved">Approved</span>';
            } else if (index === 2 && status === 'declined') {
                html += '<span class="status-result declined">Declined</span>';
            }

            html += '</div>';

            // Add connector line between steps (except after last step)
            if (index < steps.length - 1) {
                let lineClass = index < currentStepIndex ? 'completed' : '';
                html += '<div class="status-line ' + lineClass + '"></div>';
            }
        });

        html += '</div>';

        // Status description
        html += '<div class="status-description">';
        if (status === 'submitted') {
            html += '<p>Your appeal has been submitted and is awaiting review by our moderation team.</p>';
        } else if (status === 'under_review') {
            html += '<p>A moderator is currently reviewing your appeal. Please check back later for updates.</p>';
        } else if (status === 'approved') {
            html += '<p>Great news! Your appeal has been approved and your account has been unbanned. You can now use all platform features.</p>';
        } else if (status === 'declined') {
            html += '<p>Your appeal has been declined. You may submit a new appeal after the cooldown period expires.</p>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    },

    renderActiveAppeal(appeal) {
        let html = '<div class="active-appeal-card">';

        if (appeal.status === 'submitted' || appeal.status === 'under_review') {
            html += '<h4>Your Appeal</h4>';
            html += '<div class="appeal-message-preview">';
            html += '<p class="appeal-label">Submitted Message:</p>';
            html += '<p class="appeal-text">' + App.escapeHtml(appeal.appeal_message) + '</p>';
            html += '<p class="appeal-date">Submitted: ' + new Date(appeal.created_at).toLocaleString() + '</p>';
            html += '</div>';
        } else if (appeal.status === 'approved') {
            html += '<div class="appeal-result approved">';
            html += '<div class="result-icon">✅</div>';
            html += '<h4>Appeal Approved!</h4>';
            html += '<p>Your account has been unbanned. You can now access all features.</p>';
            html += '<button class="btn btn-primary" onclick="window.location.reload()">Continue to Site</button>';
            html += '</div>';
        } else if (appeal.status === 'declined') {
            html += '<div class="appeal-result declined">';
            html += '<div class="result-icon">❌</div>';
            html += '<h4>Appeal Declined</h4>';
            if (appeal.decline_reason) {
                html += '<div class="decline-reason">';
                html += '<p class="reason-label">Reason:</p>';
                html += '<p class="reason-text">' + App.escapeHtml(appeal.decline_reason) + '</p>';
                html += '</div>';
            }
            if (appeal.cooldown_until) {
                const cooldownDate = new Date(appeal.cooldown_until);
                const daysRemaining = Math.max(0, Math.ceil((cooldownDate - new Date()) / (1000 * 60 * 60 * 24)));
                html += '<p class="cooldown-text">You can submit a new appeal in ' + daysRemaining + ' day(s).</p>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    },

    renderAppealForm() {
        let html = '<div class="appeal-form-container">';
        html += '<h3>Submit an Appeal</h3>';
        html += '<p class="appeal-instructions">Explain why you believe this ban should be lifted. Be honest and provide any relevant context.</p>';

        html += '<form id="appeal-form" onsubmit="AppealPage.handleSubmit(event)">';

        html += '<div class="form-group">';
        html += '<label for="appeal-message">Your Appeal Message <span class="required">*</span></label>';
        html += '<textarea id="appeal-message" class="input-field" rows="6" placeholder="Explain why you believe this ban should be lifted... (minimum 50 characters)" required minlength="50" maxlength="2000"></textarea>';
        html += '<span class="char-count"><span id="char-count">0</span> / 2000 characters (min 50)</span>';
        html += '</div>';

        html += '<div class="form-group checkbox-group">';
        html += '<label class="checkbox-label">';
        html += '<input type="checkbox" id="understand-rules" required>';
        html += '<span>I have read and understand the platform rules and will not repeat this behavior.</span>';
        html += '</label>';
        html += '</div>';

        html += '<div class="form-actions">';
        html += '<button type="submit" class="btn btn-primary" id="submit-appeal-btn">Submit Appeal</button>';
        html += '</div>';

        html += '</form>';
        html += '</div>';

        // Add character counter handler
        setTimeout(function() {
            var textarea = document.getElementById('appeal-message');
            if (textarea) {
                textarea.addEventListener('input', function() {
                    var count = textarea.value.length;
                    var counter = document.getElementById('char-count');
                    if (counter) counter.textContent = count;
                });
            }
        }, 0);

        return html;
    },

    async handleSubmit(e) {
        e.preventDefault();

        const message = document.getElementById('appeal-message').value.trim();
        const understandRules = document.getElementById('understand-rules').checked;

        if (message.length < 50) {
            App.showToast('Please write at least 50 characters', 'error');
            return;
        }

        if (!understandRules) {
            App.showToast('Please confirm you understand the rules', 'error');
            return;
        }

        const btn = document.getElementById('submit-appeal-btn');
        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
            const result = await API.submitAppeal(message);
            App.showToast(result.message || 'Appeal submitted successfully', 'success');

            // Refresh the page to show status tracker
            setTimeout(function() {
                AppealPage.render(document.getElementById('page-container'));
            }, 1500);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Submit Appeal';

            if (err.status === 429 && err.message) {
                App.showToast(err.message, 'error');
            } else if (err.status === 409) {
                App.showToast('You already have an active appeal', 'error');
            } else {
                App.showToast(err.message || 'Failed to submit appeal', 'error');
            }
        }
    }
};
