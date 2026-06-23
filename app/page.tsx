import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FindInfo } from './components/FindInfo';
import { HomeHeading } from './components/HomeHeading';
import { News } from './components/News';

export default function Home() {
  return (
    <div className="">
      <Header />
      <main className="">
        <HomeHeading />
        <FindInfo />
        <News />
      </main>
      <Footer />
    </div>
  );
}
