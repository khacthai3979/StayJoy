async function testDownload() {
  const url = 'https://chat.stayjoy.io.vn/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBCZz09IiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--59dce9b80d68962be74b06d9ed8946fa5065a95e/room_image.jpg';
  console.log('Downloading from:', url);
  try {
    const res = await fetch(url, { method: 'GET' });
    console.log('Status:', res.status);
    console.log('Headers:', [...res.headers.entries()]);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
testDownload();
