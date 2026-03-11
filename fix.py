import re

path = 'c:/Users/Admin/Development/Venary/extensions/forum/public/pages/forum.js'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

new_str = '''                html += `
                    <div class="card forum-category-card animate-fade-up" onclick="window.location.hash='#/forum/category/${cat.id}'">
                        <div class="forum-cat-icon">${cat.icon}</div>
                        <div class="forum-cat-info">
                            <h3>${App.escapeHtml(cat.name)}</h3>
                            <p>${App.escapeHtml(cat.description)}</p>
                        </div>
                        <div class="forum-cat-stats">
                            <div class="forum-stat">
                                <span class="forum-stat-value">${cat.thread_count}</span>
                                <span class="forum-stat-label">Threads</span>
                            </div>
                            <div class="forum-stat">
                                <span class="forum-stat-value">${cat.post_count}</span>
                                <span class="forum-stat-label">Posts</span>
                            </div>
                        </div>
                    </div>
                `;'''

pattern = re.compile(r'html \+= `\s*<div class="card forum-cat-card.*?</div>\s*`;', re.DOTALL)
new_text = pattern.sub(new_str, text)

print("Changed:", text != new_text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_text)

print('Done!')
