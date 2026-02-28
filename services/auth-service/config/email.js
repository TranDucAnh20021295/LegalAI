const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const isConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

const sendResetEmail = async (toEmail, resetLink) => {
  if (!isConfigured()) return false;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: 'LegalAI - Đặt lại mật khẩu',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px;">
        <h2 style="color: #2563eb;">Đặt lại mật khẩu</h2>
        <p>Bạn đã yêu cầu đặt lại mật khẩu. Nhấn vào link bên dưới để tiếp tục:</p>
        <p><a href="${resetLink}" style="color: #2563eb; word-break: break-all;">${resetLink}</a></p>
        <p style="color: #64748b; font-size: 14px;">Link có hiệu lực trong 1 giờ.</p>
        <p style="color: #64748b; font-size: 14px;">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      </div>
    `,
  });
  return true;
};

module.exports = { sendResetEmail, isConfigured };
