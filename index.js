
// ID of the channel where the calendar message should always be kept up to date
const CALENDAR_CHANNEL_ID = '1403043156349554732';
let CALENDAR_MSG_ID_PATH;


require('dotenv').config();

const { REST, Routes } = require('discord.js');
const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    ActivityType,
    PresenceUpdateStatus,
    Events
} = require('discord.js');
const fs = require('fs');
const path = require('path');
CALENDAR_MSG_ID_PATH = path.join(__dirname, 'calendar_message.json');

const deployCommands = async () => {
    try {
        const commands = [];

        const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(__dirname, 'commands', file));
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.warn(`The command at ${file} is missing a required "data" or "execute" property.`);
            }
        }

        const rest = new REST().setToken(process.env.BOT_TOKEN);

        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
}



const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
    ],
});

client.commands = new Collection();



const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }else {
        console.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Deploy commands
    await deployCommands();
    console.log('Commands deployed successfully.');

    // Ensure calendar message exists and is up to date (with image and button)
    try {
        const { createCanvas } = require('canvas');
        const { AttachmentBuilder } = require('discord.js');
        const calendarPath = path.join(__dirname, 'calendar.json');
        let events = [];
        if (fs.existsSync(calendarPath)) {
            const data = fs.readFileSync(calendarPath, 'utf8');
            events = JSON.parse(data);
        }
        const channel = await client.channels.fetch(CALENDAR_CHANNEL_ID);
        let calendarMsgId = null;
        if (fs.existsSync(CALENDAR_MSG_ID_PATH)) {
            const msgData = JSON.parse(fs.readFileSync(CALENDAR_MSG_ID_PATH, 'utf8'));
            calendarMsgId = msgData.messageId;
        }
        let calendarMsg = null;
        if (calendarMsgId) {
            calendarMsg = await channel.messages.fetch(calendarMsgId).catch(() => null);
        }
        // Prepare calendar content and image
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const eventDays = new Set(
            events
                .map(e => new Date(e.timestamp))
                .filter(d => d.getFullYear() === year && d.getMonth() === month)
                .map(d => d.getDate())
        );
        const width = 420, height = 340;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#222';
        ctx.textAlign = 'center';
        ctx.fillText(`${now.toLocaleString('default', { month: 'long' })} ${year}`, width/2, 30);
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        ctx.font = 'bold 14px Arial';
        days.forEach((d, i) => ctx.fillText(d, 40 + i*50, 60));
        ctx.font = '16px Arial';
        let firstDay = new Date(year, month, 1).getDay();
        let daysInMonth = new Date(year, month+1, 0).getDate();
        let x0 = 15, y0 = 80, cellW = 50, cellH = 40;
        let day = 1;
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                let x = x0 + col*cellW, y = y0 + row*cellH;
                if (row === 0 && col < firstDay) continue;
                if (day > daysInMonth) continue;
                if (eventDays.has(day)) {
                    ctx.fillStyle = '#ff4d4d';
                    ctx.fillRect(x, y, cellW-4, cellH-4);
                }
                ctx.strokeStyle = '#bbb';
                ctx.strokeRect(x, y, cellW-4, cellH-4);
                ctx.fillStyle = '#222';
                ctx.fillText(day, x + cellW/2 - 2, y + 25);
                day++;
            }
        }
        const buffer = canvas.toBuffer('image/png');
        const attachment = new AttachmentBuilder(buffer, { name: 'calendar.png' });
        let content = '';
        if (events.length === 0) {
            content = 'The calendar is empty.';
        } else {
            const recentEvents = events.slice(-10).reverse();
            const eventList = recentEvents.map((event, idx) => {
                const date = new Date(event.timestamp);
                const readable = date.toLocaleString();
                return `**${recentEvents.length - idx}.** ${readable} - <@${event.user.id}> (${event.user.tag})`;
            }).join('\n');
            content = `**Event Calendar (latest 10):**\n${eventList}`;
        }
        const button = {
            type: 2,
            style: 1,
            label: 'Log Event',
            customId: 'persistent_button'
        };
        if (calendarMsg) {
            await calendarMsg.edit({ content, files: [attachment], components: [{ type: 1, components: [button] }] });
        } else {
            const sentMsg = await channel.send({ content, files: [attachment], components: [{ type: 1, components: [button] }] });
            fs.writeFileSync(CALENDAR_MSG_ID_PATH, JSON.stringify({ messageId: sentMsg.id }, null, 2), 'utf8');
        }
    } catch (err) {
        console.error('Error ensuring calendar message:', err);
    }

    const statusType = process.env.BOT_STATUS || 'online';
    const activityType = process.env.ACTIVITY_TYPE || 'WATCHING';
    const activityName = process.env.ACTIVITY_NAME || 'Nuts';

    const activityTypeMap = {
        'PLAYING': ActivityType.Playing,
        'WATCHING': ActivityType.Watching,
        'LISTENING': ActivityType.Listening,
        'COMPETING': ActivityType.Competing,
        'STREAMING': ActivityType.Streaming,
    };

    const statusMap = {
        'online': PresenceUpdateStatus.Online,
        'idle': PresenceUpdateStatus.Idle,
        'dnd': PresenceUpdateStatus.DoNotDisturb,
        'invisible': PresenceUpdateStatus.Invisible,
        'offline': PresenceUpdateStatus.Offline,
    };

    client.user.setPresence({
        status: statusMap[statusType],
        activities: [{
            name: activityName,
            type: activityTypeMap[activityType],
        }],
    });

    console.log(`Status set to ${statusType} and activity set to ${activityName} (${activityType})`);
});

client.on(Events.InteractionCreate, async interaction => {
    // Handle persistent button globally and log event
    if (interaction.isButton() && interaction.customId === 'persistent_button') {
        const calendarPath = path.join(__dirname, 'calendar.json');
        let events = [];
        try {
            if (fs.existsSync(calendarPath)) {
                const data = fs.readFileSync(calendarPath, 'utf8');
                events = JSON.parse(data);
            }
        } catch (err) {
            console.error('Error reading calendar.json:', err);
        }
        const newEvent = {
            timestamp: new Date().toISOString(),
            user: {
                id: interaction.user.id,
                username: interaction.user.username,
                tag: interaction.user.tag
            }
        };
        events.push(newEvent);
        try {
            fs.writeFileSync(calendarPath, JSON.stringify(events, null, 2), 'utf8');
        } catch (err) {
            console.error('Error writing to calendar.json:', err);
        }
        // Always update the calendar message in the specified channel, including the image and button
        try {
            const { createCanvas } = require('canvas');
            const { AttachmentBuilder } = require('discord.js');
            const channel = await client.channels.fetch(CALENDAR_CHANNEL_ID);
            let calendarMsgId = null;
            if (fs.existsSync(CALENDAR_MSG_ID_PATH)) {
                const msgData = JSON.parse(fs.readFileSync(CALENDAR_MSG_ID_PATH, 'utf8'));
                calendarMsgId = msgData.messageId;
            }
            let calendarMsg = null;
            if (calendarMsgId) {
                calendarMsg = await channel.messages.fetch(calendarMsgId).catch(() => null);
            }
            // Prepare new calendar content and image
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const eventDays = new Set(
                events
                    .map(e => new Date(e.timestamp))
                    .filter(d => d.getFullYear() === year && d.getMonth() === month)
                    .map(d => d.getDate())
            );
            const width = 420, height = 340;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, width, height);
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#222';
            ctx.textAlign = 'center';
            ctx.fillText(`${now.toLocaleString('default', { month: 'long' })} ${year}`, width/2, 30);
            const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            ctx.font = 'bold 14px Arial';
            days.forEach((d, i) => ctx.fillText(d, 40 + i*50, 60));
            ctx.font = '16px Arial';
            let firstDay = new Date(year, month, 1).getDay();
            let daysInMonth = new Date(year, month+1, 0).getDate();
            let x0 = 15, y0 = 80, cellW = 50, cellH = 40;
            let day = 1;
            for (let row = 0; row < 6; row++) {
                for (let col = 0; col < 7; col++) {
                    let x = x0 + col*cellW, y = y0 + row*cellH;
                    if (row === 0 && col < firstDay) continue;
                    if (day > daysInMonth) continue;
                    if (eventDays.has(day)) {
                        ctx.fillStyle = '#90ee90';
                        ctx.fillRect(x, y, cellW-4, cellH-4);
                    }
                    ctx.strokeStyle = '#bbb';
                    ctx.strokeRect(x, y, cellW-4, cellH-4);
                    ctx.fillStyle = '#222';
                    ctx.fillText(day, x + cellW/2 - 2, y + 25);
                    day++;
                }
            }
            const buffer = canvas.toBuffer('image/png');
            const attachment = new AttachmentBuilder(buffer, { name: 'calendar.png' });
            let content = '';
            if (events.length === 0) {
                content = 'The calendar is empty.';
            } else {
                const recentEvents = events.slice(-10).reverse();
                const eventList = recentEvents.map((event, idx) => {
                    const date = new Date(event.timestamp);
                    const readable = date.toLocaleString();
                    return `**${recentEvents.length - idx}.** ${readable} - <@${event.user.id}> (${event.user.tag})`;
                }).join('\n');
                content = `**Event Calendar (latest 10):**\n${eventList}`;
            }
            const button = {
                type: 2,
                style: 1,
                label: 'Log Event',
                customId: 'persistent_button'
            };
            if (calendarMsg) {
                await calendarMsg.edit({ content, files: [attachment], components: [{ type: 1, components: [button] }] });
            } else {
                const sentMsg = await channel.send({ content, files: [attachment], components: [{ type: 1, components: [button] }] });
                fs.writeFileSync(CALENDAR_MSG_ID_PATH, JSON.stringify({ messageId: sentMsg.id }, null, 2), 'utf8');
            }
        } catch (err) {
            console.error('Error updating calendar message:', err);
        }
        await interaction.reply({ content: 'Event logged in calendar!', flags: 64 });
        return;
    }

    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        // console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

client.login(process.env.BOT_TOKEN);