import IslandGame from "./IslandGame";

export const metadata = {
  title: "Echo Island — เกาะที่จดจำคุณ",
  description: "เกมผจญภัยเอาตัวรอด 3D บนเว็บ ซ่อมหอส่งสัญญาณก่อนค่ำคืนจะกลืนกินเกาะ",
};

export default function Home() {
  return <IslandGame />;
}
