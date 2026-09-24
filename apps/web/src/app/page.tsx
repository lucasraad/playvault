export default function Home() {
  return (
    <main>
      <section aria-labelledby="page-title">
        <p className="eyebrow">Fundação do projeto</p>
        <h1 id="page-title">Gamer Profile</h1>
        <p className="description">
          Uma identidade gamer única para organizar sua biblioteca em todas as plataformas.
        </p>
        <div className="status" role="status">
          <span aria-hidden="true" />
          Frontend em execução
        </div>
      </section>
    </main>
  );
}
