import { PluginSettingTab, Setting } from 'obsidian';
import type TodoWorkspacePlugin from './main';
import type { TodoLeafTarget } from './types';

export class TodoWorkspaceSettingTab extends PluginSettingTab {
  constructor(app: import('obsidian').App, private readonly plugin: TodoWorkspacePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'TaskFlow 设置' });

    // ─── 基础设置 ──────────────────────────────────────────────────────
    containerEl.createEl('h3', { text: '基础设置' });

    new Setting(containerEl)
      .setName('默认打开位置')
      .setDesc('决定 TaskFlow 视图默认打开在右侧栏还是主工作区。')
      .addDropdown((dropdown) => {
        dropdown.addOption('right', '右侧栏');
        dropdown.addOption('main', '主工作区');
        dropdown.setValue(this.plugin.getSettings().leafTarget);
        dropdown.onChange(async (value) => {
          await this.plugin.updateSettings({ leafTarget: value as TodoLeafTarget });
        });
      });

    new Setting(containerEl)
      .setName('创建任务时自动关联当前笔记')
      .setDesc('开启后，在工作台中新建任务时会尝试记录当前活动笔记路径，便于后续回跳。')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.getSettings().autoLinkActiveNote);
        toggle.onChange(async (value) => {
          await this.plugin.updateSettings({ autoLinkActiveNote: value });
        });
      });

    // ─── Supabase 同步设置 ─────────────────────────────────────────────
    containerEl.createEl('h3', { text: 'Supabase 云同步' });
    containerEl.createEl('p', {
      text: '配置 Supabase 后，TaskFlow 插件将与 Web 端实时同步任务数据。',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('启用云同步')
      .setDesc('开启后将在每次任务变更时自动推送到 Supabase。')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.getSettings().syncEnabled);
        toggle.onChange(async (value) => {
          await this.plugin.updateSettings({ syncEnabled: value });
          if (value) {
            await this.plugin.sync.init();
          } else {
            this.plugin.sync.destroy();
          }
        });
      });

    new Setting(containerEl)
      .setName('Supabase URL')
      .setDesc('你的 Supabase 项目 URL，格式：https://xxxx.supabase.co')
      .addText((text) => {
        text
          .setPlaceholder('https://xxxx.supabase.co')
          .setValue(this.plugin.getSettings().supabaseUrl)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ supabaseUrl: value });
          });
      });

    new Setting(containerEl)
      .setName('Supabase Anon Key')
      .setDesc('项目的公开匿名 Key（anon/public key）')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
          .setValue(this.plugin.getSettings().supabaseAnonKey)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ supabaseAnonKey: value });
          });
      });

    new Setting(containerEl)
      .setName('登录邮箱')
      .setDesc('你的 TaskFlow 账号邮箱')
      .addText((text) => {
        text.inputEl.type = 'email';
        text
          .setPlaceholder('user@example.com')
          .setValue(this.plugin.getSettings().supabaseEmail)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ supabaseEmail: value });
          });
      });

    new Setting(containerEl)
      .setName('登录密码')
      .setDesc('你的 TaskFlow 账号密码')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('••••••••')
          .setValue(this.plugin.getSettings().supabasePassword)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ supabasePassword: value });
          });
      });

    // 测试连接 / 立即同步按钮
    new Setting(containerEl)
      .setName('同步状态')
      .setDesc(
        this.plugin.getSettings().lastSyncAt
          ? `上次同步：${new Date(this.plugin.getSettings().lastSyncAt!).toLocaleString('zh-CN')}`
          : '尚未同步'
      )
      .addButton((btn) => {
        btn
          .setButtonText('测试连接 / 立即同步')
          .setCta()
          .onClick(async () => {
            btn.setButtonText('同步中…');
            btn.setDisabled(true);
            try {
              await this.plugin.sync.syncNow();
              // Refresh the settings tab to update lastSyncAt display
              this.display();
            } finally {
              btn.setButtonText('测试连接 / 立即同步');
              btn.setDisabled(false);
            }
          });
      });

    // ─── 同步频率设置 ──────────────────────────────────────────────────
    containerEl.createEl('h3', { text: '同步频率' });

    new Setting(containerEl)
      .setName('防抖延迟（毫秒）')
      .setDesc('文件变更后等待多久再推送到云端。数值越大同步越省流，但延迟越高。默认 2000ms。')
      .addText((text) => {
        text
          .setPlaceholder('2000')
          .setValue(String(this.plugin.getSettings().syncDebounceMs ?? 2000))
          .onChange(async (value) => {
            const ms = parseInt(value, 10);
            if (!isNaN(ms) && ms >= 500) {
              await this.plugin.updateSettings({ syncDebounceMs: ms });
            }
          });
      });

    new Setting(containerEl)
      .setName('最小推送间隔（毫秒）')
      .setDesc('两次背景推送之间的最短间隔，防止短时间内重复推送。默认 30000ms（30 秒）。')
      .addText((text) => {
        text
          .setPlaceholder('30000')
          .setValue(String(this.plugin.getSettings().syncMinIntervalMs ?? 30000))
          .onChange(async (value) => {
            const ms = parseInt(value, 10);
            if (!isNaN(ms) && ms >= 5000) {
              await this.plugin.updateSettings({ syncMinIntervalMs: ms });
            }
          });
      });
  }
}
