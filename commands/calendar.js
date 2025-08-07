const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('calendar')
        .setDescription('Displays the event calendar.'),
    async execute(interaction) {
        const calendarPath = path.join(__dirname, '..', 'calendar.json');
        let events = [];
        try {
            if (fs.existsSync(calendarPath)) {
                const data = fs.readFileSync(calendarPath, 'utf8');
                events = JSON.parse(data);
            }
        } catch (err) {
            console.error('Error reading calendar.json:', err);
            await interaction.reply({ content: 'Error reading the calendar.', ephemeral: true });
            return;
        }
        const button = {
            type: 2,
            style: 1,
            label: 'Log Event',
            customId: 'persistent_button'
        };

        // Prepare event days for the current month
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        // Get all event days in this month
        const eventDays = new Set(
            events
                .map(e => new Date(e.timestamp))
                .filter(d => d.getFullYear() === year && d.getMonth() === month)
                .map(d => d.getDate())
        );

        // Draw calendar image
        const width = 420, height = 340;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#222';
        ctx.textAlign = 'center';
        ctx.fillText(`${now.toLocaleString('default', { month: 'long' })} ${year}`, width/2, 30);
        // Draw day names
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        ctx.font = 'bold 14px Arial';
        days.forEach((d, i) => ctx.fillText(d, 40 + i*50, 60));
        // Draw grid and numbers
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
                // Highlight event days in red
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
        // Save image to buffer
        const buffer = canvas.toBuffer('image/png');
        const attachment = new AttachmentBuilder(buffer, { name: 'calendar.png' });

        // Compose event list for text
        let eventList = '';
        if (events.length === 0) {
            eventList = 'The calendar is empty.';
        } else {
            const recentEvents = events.slice(-10).reverse();
            eventList = recentEvents.map((event, idx) => {
                const date = new Date(event.timestamp);
                const readable = date.toLocaleString();
                return `**${recentEvents.length - idx}.** ${readable} - <@${event.user.id}> (${event.user.tag})`;
            }).join('\n');
        }

        await interaction.reply({
            content: `**Event Calendar (latest 10):**\n${eventList}`,
            files: [attachment],
            components: [{ type: 1, components: [button] }]
        });
    }
};
