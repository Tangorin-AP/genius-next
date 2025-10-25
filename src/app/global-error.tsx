'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{display:'grid',placeItems:'center',minHeight:'100vh'}}>
          <div style={{maxWidth:520, padding:24, border:'1px solid #e5e5e5', borderRadius:12}}>
            <h1 style={{fontSize:20, fontWeight:600, marginBottom:8}}>App crashed</h1>
            <p style={{color:'#666', marginBottom:16}}>We hit an unexpected error.</p>
            <button onClick={() => reset()} style={{padding:'8px 12px', background:'#000', color:'#fff', borderRadius:8}}>
              Try again
            </button>
            <a href="/" style={{marginLeft:12, padding:'8px 12px', border:'1px solid #ddd', borderRadius:8}}>
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
