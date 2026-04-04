/**
 * Bắt lỗi listen (EADDRINUSE, …) để không crash với "Unhandled 'error' event".
 */
function mountListen(app, port, serviceName, onListening) {
  const server = app.listen(port, () => {
    if (typeof onListening === 'function') onListening();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[${serviceName}] Port ${port} đã được process khác sử dụng (EADDRINUSE).\n` +
          '  Có thể gateway/service đang chạy ở terminal khác — hãy dừng bản cũ trước.\n' +
          `  Windows — tìm PID:    netstat -ano | findstr :${port}\n` +
          '            dừng:      taskkill /PID <PID> /F\n' +
          `  Hoặc đổi port: đặt PORT=... trong .env của service này.`
      );
      process.exit(1);
      return;
    }
    console.error(`[${serviceName}] Lỗi khi listen:`, err.message || err);
    process.exit(1);
  });

  return server;
}

module.exports = { mountListen };
