const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pbutton')
        .setDescription('Creates a persistent button'),
    async execute(interaction) {
        const button = {
            type: 2,
            style: 1,
            label: 'Click me!',
            customId: 'persistent_button'
        };
        await interaction.channel.send({
            content: 'Here is your button:',
            components: [{ type: 1, components: [button] }]
        });
    }
};