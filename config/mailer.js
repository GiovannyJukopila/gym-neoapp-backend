'use strict';
const nodemailer = require('nodemailer');

// Configure the transporter for sending emails
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'goneoapp@gmail.com',
    pass: 'sahv uasy fzei rykf',
  },
});

// Function to build custom HTML content
function buildCustomEmailContent() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email</title>
        <style>
            body {
                background-color: #FFFFFF;
                font-family: Arial, sans-serif;
            }
            header {
                background-color: #FFA500;
                color: #FFFFFF;
                padding: 20px;
                text-align: center;
            }
            main {
                padding: 20px;
            }
            footer {
                background-color: #FFA500;
                color: #FFFFFF;
                padding: 20px;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <header>
            <h1>Welcome to Neo App!</h1>
        </header>
        <main>
            <p>Hello,</p>
            <p>Welcome to Neo App. We hope you enjoy our services.</p>
            <p>Thank you for joining us.</p>
        </main>
        <footer>
            <p>Neo App &copy; 2023 - All rights reserved</p>
        </footer>
    </body>
    </html>
  `;
}

// async..await is not allowed in the global scope, must use a wrapper
async function sendCustomEmail(recipient, subject) {
  try {
    // Send an email with the defined transport object
    const info = await transporter.sendMail({
      from: '"No Reply - Neo App 👻" <goneoapp@gmail.com>',
      to: recipient,
      subject: subject,
      html: buildCustomEmailContent(),
    });
  } catch (error) {
    console.error('Error sending email to ' + recipient + ':', error);
  }
}

async function main() {
  // List of recipients and custom subjects
  const recipientsAndSubjects = [
    { recipient: 'isa28.05@outlook.com', subject: 'Welcome to Neo App' },
    {
      recipient: 'jukopila.giovanny15@gmail.com',
      subject: 'Hello! Welcome aboard',
    },
    {
      recipient: 'jukopila.giovanny@hotmail.com',
      subject: 'New Beginning with Neo App',
    },
    // {
    //   recipient: 'alex@digiprint.com.mt',
    //   subject: 'New Beginning with Neo App',
    // },
  ];

  for (const { recipient, subject } of recipientsAndSubjects) {
    await sendCustomEmail(recipient, subject);
  }
}

main().catch(console.error);
