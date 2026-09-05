import { PermissionsBitField, MessageFlags } from 'discord.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export default {
  async execute(interaction) {
    try {
      const memberPermissions = new PermissionsBitField(interaction.member.permissions);
      if (!memberPermissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'You need **Manage Server** permissions.',
        });
      }

      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

      const destination = interaction.options.getString('destination');
      const channel = interaction.options.getChannel('channel');

      await setLogChannel(interaction.client, interaction.guildId, destination, channel ? channel.id : null);

      const message = channel
        ? `✅ Log channel updated to ${channel}.`
        : `🗑️ Log channel cleared.`;
      
      await InteractionHelper.safeEditReply(interaction, { content: message });
    } catch (error) {
      logger.error('logging_channel error:', error);
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Failed to update the log channel.',
      });
    }
  },
};
