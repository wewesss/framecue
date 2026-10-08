import classigo from "classigo";

export function App() {
  return (
    <div className={classigo("app", { "app--empty": true })}>
      <header className="app__header">framecue</header>
      <main className="app__player" />
    </div>
  );
}
