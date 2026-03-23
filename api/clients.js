
export default function handler(req, res) {
  const clientList = process.env.CLIENT_LIST || '';
  const clients = clientList.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  res.status(200).json({ clients });
}
