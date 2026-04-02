export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/tokens",
      permanent: false
    }
  };
}

export default function IndexPage() {
  return null;
}
