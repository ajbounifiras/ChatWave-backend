require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const users = {};

const getAIReply = async (message, username) => {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{
        role: 'system',
        content: `You are ChatWave Bot, a friendly assistant in a chat app.
        Keep responses short (1-2 sentences max), friendly and conversational.
        The user's name is ${username}.
        Reply in the same language the user writes in (French, or English).`
      }, {
        role: 'user',
        content: message
      }],
      max_tokens: 100
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Groq API error:', error.message);
    return "Sorry, I'm having trouble responding right now! 😅";
  }
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', async (username) => {
    users[socket.id] = username;

    io.emit('user_joined', {
      username,
      message: `${username} joined the chat`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      type: 'system'
    });

    io.emit('online_users', Object.values(users));

    setTimeout(async () => {
      const welcomeMsg = await getAIReply(
        `Say a short friendly welcome message to ${username} who just joined the chat.`,
        username
      );
      socket.emit('receive_message', {
        username: '🤖 AI Assistant',
        message: welcomeMsg,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        type: 'message',
        isBot: true
      });
    }, 500);
  });

  socket.on('send_message', async (data) => {
    io.emit('receive_message', {
      username: users[socket.id],
      message: data.message,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      type: 'message',
      isBot: false
    });

    socket.emit('bot_typing', true);
    const aiReply = await getAIReply(data.message, users[socket.id]);
    socket.emit('bot_typing', false);

    socket.emit('receive_message', {
      username: '🤖 AI Assistant',
      message: aiReply,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      type: 'message',
      isBot: true
    });
  });

  socket.on('disconnect', () => {
    const username = users[socket.id];
    if (username) {
      delete users[socket.id];
      io.emit('user_left', {
        username,
        message: `${username} left the chat`,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        type: 'system'
      });
      io.emit('online_users', Object.values(users));
    }
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log('🚀 Server running on port 3001');
  console.log('🤖 Groq AI ready!');
});