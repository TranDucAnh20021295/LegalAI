const { splitTextIntoChunks } = require('./lib/splitText');
const text = `
Biển hiệu, mốc hiệu của công trình giao thông đường sắt;

đ) Để súc vật đi qua đường sắt không theo đúng quy định hoặc để súc vật kéo xe qua đường sắt mà không có người điều khiển;

e ) Đưa trái phép phương tiện tự tạo, phương tiện không được phép chạy lên đường sắt;

g) Lấn chiếm phạm vi giới hạn bảo đảm an toàn công trình giao thông đường sắt;

h) Hành vi khác gây cản trở giao thông đường sắt.

2. Phạm tội gây hậu quả rất nghiêm trọng thì bị phạt tù từ ba năm đến mười năm.

3. Phạm tội gây hậu quả đặc biệt nghiêm trọng thì bị phạt tù từ bảy năm đến mười lăm năm.

4. Phạm tội trong trường hợp đặc biệt nghiêm trọng thì bị phạt tù từ mười hai năm đến hai mươi năm.
`;

const chunks = splitTextIntoChunks(text, 1500, 200);
console.log("Original length:", text.length);
console.log("Chunks:", chunks);
console.log("Joined chunks length:", chunks.join('').length);
