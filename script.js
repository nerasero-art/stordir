/* ==========================================================
   Linea del tempo — Logica della pagina
   - Ricerca in tempo reale tra date ed eventi
   - Evidenziazione delle parole trovate
   - Animazioni di comparsa e avanzamento della linea
   ========================================================== */

(function () {
  'use strict';

  // Segnala alla pagina che lo script è stato caricato correttamente
  window.lineaDelTempoPronta = true;
  document.documentElement.classList.add('js');

  /* ---------- Elementi della pagina ---------- */
  const campo = document.getElementById('campo-ricerca');
  const modulo = document.querySelector('.ricerca');
  const pulsantePulisci = document.querySelector('.pulisci');
  const contatore = document.getElementById('contatore');
  const lineaDelTempo = document.getElementById('linea-del-tempo');
  const barra = document.querySelector('.barra-superiore');
  const epoche = Array.from(document.querySelectorAll('.epoca'));
  const eventi = Array.from(document.querySelectorAll('.evento'));
  const riquadroVuoto = document.getElementById('nessun-risultato');
  const termineCercato = document.getElementById('termine-cercato');
  const pulsanteAzzera = document.getElementById('azzera-ricerca');
  const suggerimenti = Array.from(document.querySelectorAll('.chip'));
  const pulsanteSu = document.querySelector('.torna-su');

  if (!campo || !modulo || !lineaDelTempo) {
    return;
  }

  const totale = eventi.length;
  const movimentoRidotto = window.matchMedia('(prefers-reduced-motion: reduce)');
  const schermoTouch = window.matchMedia('(pointer: coarse)');
  const SELETTORE_CAMPI = '.data, .titolo, .sottotitolo, .descrizione, .etichette li';

  /* ---------- Funzioni sul testo ---------- */

  // Minuscole, senza accenti e con trattini e apostrofi uniformi:
  // così "citta" trova "città" e "d'Italia" trova "d’Italia".
  function normalizza(testo) {
    return testo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[–—]/g, '-')
      .replace(/[‘’]/g, "'");
  }

  // Crea la versione normalizzata del testo e ricorda, per ogni carattere,
  // la sua posizione nel testo originale (serve per evidenziare).
  function mappaTesto(testo) {
    let normalizzato = '';
    const inizi = [];
    const fini = [];
    let posizione = 0;

    for (const carattere of testo) {
      const convertito = normalizza(carattere);
      for (let i = 0; i < convertito.length; i += 1) {
        normalizzato += convertito[i];
        inizi.push(posizione);
        fini.push(posizione + carattere.length);
      }
      posizione += carattere.length;
    }

    return { normalizzato: normalizzato, inizi: inizi, fini: fini };
  }

  function escapeHtml(testo) {
    return testo.replace(/[&<>"']/g, function (carattere) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[carattere];
    });
  }

  // Divide la ricerca in parole chiave: ogni parola deve comparire nell'evento.
  function estraiTermini(ricerca) {
    const visti = new Set();

    return normalizza(ricerca)
      .split(/\s+/)
      .map(function (termine) {
        return termine
          .replace(/^[^\p{L}\p{N}]+/u, '')
          .replace(/[^\p{L}\p{N}.]+$/u, '');
      })
      .filter(function (termine) {
        if (!termine || visti.has(termine)) {
          return false;
        }
        visti.add(termine);
        return true;
      });
  }

  // Restituisce l'HTML del testo con le parole trovate dentro <mark>,
  // oppure null se nel testo non c'è nessuna corrispondenza.
  function evidenzia(testo, termini) {
    const mappa = mappaTesto(testo);
    const intervalli = [];

    termini.forEach(function (termine) {
      let da = 0;
      let trovato = mappa.normalizzato.indexOf(termine, da);

      while (trovato !== -1) {
        intervalli.push([mappa.inizi[trovato], mappa.fini[trovato + termine.length - 1]]);
        da = trovato + termine.length;
        trovato = mappa.normalizzato.indexOf(termine, da);
      }
    });

    if (intervalli.length === 0) {
      return null;
    }

    // Ordina e unisce gli intervalli che si sovrappongono
    intervalli.sort(function (a, b) {
      return a[0] - b[0];
    });

    const uniti = [];
    intervalli.forEach(function (intervallo) {
      const ultimo = uniti[uniti.length - 1];
      if (ultimo && intervallo[0] <= ultimo[1]) {
        ultimo[1] = Math.max(ultimo[1], intervallo[1]);
      } else {
        uniti.push([intervallo[0], intervallo[1]]);
      }
    });

    let html = '';
    let cursore = 0;
    uniti.forEach(function (intervallo) {
      html += escapeHtml(testo.slice(cursore, intervallo[0]));
      html += '<mark>' + escapeHtml(testo.slice(intervallo[0], intervallo[1])) + '</mark>';
      cursore = intervallo[1];
    });
    html += escapeHtml(testo.slice(cursore));

    return html;
  }

  /* ---------- Indice di ricerca ---------- */

  // Per ogni evento: i campi visibili da evidenziare e il testo completo in cui cercare
  // (data, titolo, sottotitolo, descrizione, etichette, parole chiave nascoste ed epoca).
  const indice = eventi.map(function (evento) {
    const campi = Array.from(evento.querySelectorAll(SELETTORE_CAMPI)).map(function (elemento) {
      const testo = elemento.textContent.replace(/\s+/g, ' ').trim();
      elemento.textContent = testo;
      return { elemento: elemento, testo: testo };
    });

    const epoca = evento.closest('.epoca');
    const nomeEpoca = epoca ? epoca.getAttribute('data-epoca') || '' : '';
    const paroleChiave = evento.getAttribute('data-parole') || '';
    const testoCompleto = campi.map(function (voce) {
      return voce.testo;
    }).join(' ') + ' ' + paroleChiave + ' ' + nomeEpoca;

    return {
      evento: evento,
      campi: campi,
      testo: normalizza(testoCompleto)
    };
  });

  /* ---------- Ricerca ---------- */

  let ultimaRicerca = null;

  function applicaRicerca(valore) {
    const ricerca = valore.trim();

    if (ricerca === ultimaRicerca) {
      return;
    }
    ultimaRicerca = ricerca;

    const termini = estraiTermini(ricerca);
    const attiva = termini.length > 0;
    let trovati = 0;

    indice.forEach(function (voce) {
      const corrisponde = !attiva || termini.every(function (termine) {
        return voce.testo.indexOf(termine) !== -1;
      });

      voce.evento.hidden = !corrisponde;

      if (corrisponde) {
        trovati += 1;
        if (attiva) {
          voce.evento.classList.add('visibile');
        }
      }

      voce.campi.forEach(function (voceCampo) {
        const html = attiva && corrisponde ? evidenzia(voceCampo.testo, termini) : null;
        if (html !== null) {
          voceCampo.elemento.innerHTML = html;
        } else if (voceCampo.elemento.firstElementChild) {
          // Toglie l'evidenziazione precedente
          voceCampo.elemento.textContent = voceCampo.testo;
        }
      });
    });

    // Nasconde le epoche senza eventi visibili
    epoche.forEach(function (epoca) {
      epoca.hidden = !epoca.querySelector('.evento:not([hidden])');
    });

    assegnaLati();
    aggiornaContatore(trovati, attiva);

    const nessunRisultato = attiva && trovati === 0;
    riquadroVuoto.hidden = !nessunRisultato;
    lineaDelTempo.classList.toggle('vuota', nessunRisultato);
    if (nessunRisultato) {
      termineCercato.textContent = ricerca;
    }

    suggerimenti.forEach(function (chip) {
      const selezionato = attiva && normalizza(chip.getAttribute('data-cerca') || '') === normalizza(ricerca);
      chip.setAttribute('aria-pressed', selezionato ? 'true' : 'false');
    });

    aggiornaIndirizzo(ricerca);
    aggiornaAvanzamento();
  }

  // Alterna gli eventi visibili a sinistra e a destra della linea
  function assegnaLati() {
    let posizione = 0;
    eventi.forEach(function (evento) {
      if (evento.hidden) {
        return;
      }
      const aDestra = posizione % 2 === 1;
      evento.classList.toggle('destra', aDestra);
      evento.classList.toggle('sinistra', !aDestra);
      posizione += 1;
    });
  }

  function aggiornaContatore(trovati, attiva) {
    if (!attiva) {
      contatore.innerHTML = '<strong>' + totale + '</strong> eventi';
    } else if (trovati === 0) {
      contatore.innerHTML = '<strong>Nessun</strong> risultato';
    } else {
      contatore.innerHTML = '<strong>' + trovati + '</strong> ' +
        (trovati === 1 ? 'evento trovato' : 'eventi trovati') + ' su ' + totale;
    }
  }

  function aggiornaStatoCampo() {
    const pieno = campo.value.length > 0;
    modulo.classList.toggle('ha-testo', pieno);
    pulsantePulisci.hidden = !pieno;
  }

  // Salva la ricerca nell'indirizzo (?q=...) così si può condividere il link
  function aggiornaIndirizzo(ricerca) {
    try {
      const url = new URL(window.location.href);
      if (ricerca) {
        url.searchParams.set('q', ricerca);
      } else {
        url.searchParams.delete('q');
      }
      if (url.href !== window.location.href) {
        window.history.replaceState(null, '', url.href);
      }
    } catch (errore) {
      // Alcuni browser non lo permettono per i file aperti in locale: la ricerca funziona comunque.
    }
  }

  // Porta i risultati (o il messaggio "nessun evento trovato") appena sotto la barra di ricerca
  function portaAiRisultati() {
    const obiettivo = lineaDelTempo.classList.contains('vuota') ? riquadroVuoto : lineaDelTempo;
    const altezzaBarra = barra ? barra.getBoundingClientRect().height : 0;
    const destinazione = Math.max(0, obiettivo.getBoundingClientRect().top + window.pageYOffset - altezzaBarra - 12);

    if (Math.abs(window.pageYOffset - destinazione) < 8) {
      return;
    }

    window.scrollTo({
      top: destinazione,
      behavior: movimentoRidotto.matches ? 'auto' : 'smooth'
    });
  }

  function pulisciRicerca() {
    campo.value = '';
    aggiornaStatoCampo();
    applicaRicerca('');
  }

  /* ---------- Avanzamento della linea e pulsante "torna su" ---------- */

  let aggiornamentoInAttesa = false;

  function aggiornaAvanzamento() {
    const riquadro = lineaDelTempo.getBoundingClientRect();
    const riferimento = window.innerHeight * 0.55;
    let avanzamento = 0;

    if (riquadro.height > 0) {
      avanzamento = (riferimento - riquadro.top) / riquadro.height;
    }
    avanzamento = Math.min(1, Math.max(0, avanzamento));
    lineaDelTempo.style.setProperty('--avanzamento', avanzamento.toFixed(4));

    // Accende i pallini degli eventi già superati
    eventi.forEach(function (evento) {
      if (evento.hidden) {
        return;
      }
      const centroPallino = evento.getBoundingClientRect().top + 39;
      evento.classList.toggle('raggiunto', centroPallino < riferimento);
    });

    if (pulsanteSu) {
      pulsanteSu.classList.toggle('visibile', window.pageYOffset > 640);
    }
  }

  function richiediAggiornamento() {
    if (aggiornamentoInAttesa) {
      return;
    }
    aggiornamentoInAttesa = true;
    window.requestAnimationFrame(function () {
      aggiornamentoInAttesa = false;
      aggiornaAvanzamento();
    });
  }

  /* ---------- Animazione di comparsa ---------- */

  function preparaComparsa() {
    if (!('IntersectionObserver' in window) || movimentoRidotto.matches) {
      eventi.forEach(function (evento) {
        evento.classList.add('visibile');
      });
      return;
    }

    const osservatore = new IntersectionObserver(function (voci) {
      voci.forEach(function (voce) {
        if (voce.isIntersecting) {
          voce.target.classList.add('visibile');
          osservatore.unobserve(voce.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

    eventi.forEach(function (evento) {
      if (!evento.classList.contains('visibile')) {
        osservatore.observe(evento);
      }
    });
  }

  /* ---------- Eventi dell'interfaccia ---------- */

  // Ricerca in tempo reale mentre si digita
  campo.addEventListener('input', function () {
    aggiornaStatoCampo();
    applicaRicerca(campo.value);
    if (campo.value.trim()) {
      portaAiRisultati();
    }
  });

  // Invio: niente ricaricamento della pagina
  modulo.addEventListener('submit', function (evento) {
    evento.preventDefault();
    applicaRicerca(campo.value);
    if (campo.value.trim()) {
      portaAiRisultati();
    }
    if (schermoTouch.matches) {
      campo.blur(); // chiude la tastiera sul telefono
    }
  });

  // Esc cancella la ricerca
  campo.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') {
      if (campo.value) {
        evento.preventDefault();
        pulisciRicerca();
      } else {
        campo.blur();
      }
    }
  });

  // Scorciatoie: "/" oppure Ctrl+K (Cmd+K su Mac) per andare alla ricerca
  document.addEventListener('keydown', function (evento) {
    const attivo = document.activeElement;
    const staScrivendo = attivo && (
      attivo.tagName === 'INPUT' ||
      attivo.tagName === 'TEXTAREA' ||
      attivo.isContentEditable
    );
    const barraObliqua = evento.key === '/' && !staScrivendo && !evento.ctrlKey && !evento.metaKey && !evento.altKey;
    const ctrlK = (evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k';

    if (barraObliqua || ctrlK) {
      evento.preventDefault();
      campo.focus();
      campo.select();
    }
  });

  pulsantePulisci.addEventListener('click', function () {
    pulisciRicerca();
    campo.focus();
  });

  if (pulsanteAzzera) {
    pulsanteAzzera.addEventListener('click', function () {
      pulisciRicerca();
      campo.focus();
      portaAiRisultati();
    });
  }

  // Ricerche suggerite: un clic avvia la ricerca, un secondo clic la annulla
  suggerimenti.forEach(function (chip) {
    chip.addEventListener('click', function () {
      const giaSelezionato = chip.getAttribute('aria-pressed') === 'true';
      campo.value = giaSelezionato ? '' : chip.getAttribute('data-cerca') || '';
      aggiornaStatoCampo();
      applicaRicerca(campo.value);
      if (!giaSelezionato) {
        portaAiRisultati();
      }
    });
  });

  if (pulsanteSu) {
    pulsanteSu.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: movimentoRidotto.matches ? 'auto' : 'smooth' });
    });
  }

  window.addEventListener('scroll', richiediAggiornamento, { passive: true });
  window.addEventListener('resize', richiediAggiornamento);

  /* ---------- Testo segnaposto più corto sui telefoni ---------- */

  const schermoStretto = window.matchMedia('(max-width: 640px)');
  const segnapostoLungo = campo.getAttribute('placeholder') || '';
  const segnapostoCorto = 'Cerca date, eventi, nomi…';

  function aggiornaSegnaposto() {
    campo.setAttribute('placeholder', schermoStretto.matches ? segnapostoCorto : segnapostoLungo);
  }

  if (schermoStretto.addEventListener) {
    schermoStretto.addEventListener('change', aggiornaSegnaposto);
  } else if (schermoStretto.addListener) {
    schermoStretto.addListener(aggiornaSegnaposto); // browser meno recenti
  }

  /* ---------- Avvio ---------- */

  // Se l'indirizzo contiene ?q=..., la ricerca parte già compilata
  const ricercaIniziale = new URLSearchParams(window.location.search).get('q') || '';
  campo.value = ricercaIniziale;
  aggiornaSegnaposto();
  aggiornaStatoCampo();
  applicaRicerca(ricercaIniziale);
  preparaComparsa();
  aggiornaAvanzamento();

  if (ricercaIniziale.trim()) {
    // Evita che il browser riporti la pagina alla posizione precedente
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    if (document.readyState === 'complete') {
      portaAiRisultati();
    } else {
      window.addEventListener('load', portaAiRisultati, { once: true });
    }
  }
})();
