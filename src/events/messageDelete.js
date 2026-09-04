import { Events, AuditLogEvent } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getReactionRoleMessage, deleteReactionRoleMessage } from '../services/reactionRoleService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH = 1024;

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    try {
      if (!message.guild) return;

      // تنظيف بيانات الـ Reaction Roles
      try {
        const reactionRoleData = await getReactionRoleMessage(message.client, message.guild.id, message.id);
        if (reactionRoleData) {
          await deleteReactionRoleMessage(message.client, message.guild.id, message.id);
          logger.info(`Cleaned up reaction role database entry for manually deleted message ${message.id} in guild ${message.guild.id}`);

          try {
            await logEvent({
              client: message.client,
              guildId: message.guild.id,
              eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
              data: {
                title: 'Reaction Role Removed',
                lines: [
                  formatLogLine('Channel', message.channel ? `${message.channel.name} ${message.channel.toString()}` : 'Unknown'),
                  formatLogLine('Message ID', `\`${message.id}\``),
                  formatLogLine('Cleanup', 'Database entry removed automatically'),
                ],
                quoted: true,
              }
            });
          } catch (logCleanupError) {
            logger.warn('Failed to log reaction role cleanup after manual message deletion:', logCleanupError);
          }
        }
      } catch (reactionRoleCleanupError) {
        logger.warn(`Failed to clean up reaction role data for deleted message ${message.id}:`, reactionRoleCleanupError);
      }

      if (message.author?.bot) return;

      // جلب Audit Logs لمعرفة إذا كان هناك إداري مسح الرسالة
      let deletedBy = message.author ? `${message.author.toString()} (صاحب الرسالة)` : 'غير معروف';

      try {
        // ننتظر 1 ثانية بسيطة لضمان تسجيل ديسكورد للحدث في Audit Logs
        await new Promise((res) => setTimeout(res, 1000));

        const fetchedLogs = await message.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MessageDelete,
        });
        const deletionLog = fetchedLogs.entries.first();

        if (deletionLog) {
          const { executor, target, createdTimestamp, extra } = deletionLog;
          
          // إذا كان الحدث يخص نفس صاحب الرسالة ونفس القناة وتم خلال آخر 5 ثوانٍ
          if (
            target?.id === message.author?.id &&
            extra?.channel?.id === message.channel.id &&
            Date.now() - createdTimestamp < 5000
          ) {
            deletedBy = `${executor.toString()} (${executor.tag})`;
          }
        }
      } catch (auditError) {
        logger.warn(`Could not fetch audit logs for message deletion in guild ${message.guild.id}:`, auditError.message);
      }

      const metaLines = [
        formatLogLine('Channel', message.channel ? `${message.channel.name} ${message.channel.toString()}` : 'Unknown'),
        formatLogLine('Message ID', `\`${message.id}\``),
        formatLogLine('Message author', message.author ? message.author.toString() : 'Unknown'),
        formatLogLine('Deleted by', deletedBy),
        formatLogLine('Message created', `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`),
      ];

      let messageBody = null;
      if (message.content) {
        messageBody = message.content.length > MAX_LOGGED_MESSAGE_CONTENT_LENGTH
          ? `${message.content.substring(0, MAX_LOGGED_MESSAGE_CONTENT_LENGTH - 3)}...`
          : message.content;
      }

      if (message.attachments.size > 0) {
        metaLines.push(formatLogLine('Attachments', String(message.attachments.size)));
      }

      await logEvent({
        client: message.client,
        guildId: message.guild.id,
        eventType: EVENT_TYPES.MESSAGE_DELETE,
        data: {
          title: 'Message deleted',
          lines: metaLines,
          quoted: true,
          section: messageBody ? { title: 'Message', body: messageBody || '*(empty message)*' } : null,
          userId: message.author?.id,
          channelId: message.channel.id,
        }
      });

    } catch (error) {
      logger.error('Error in messageDelete event:', error);
    }
  }
};
