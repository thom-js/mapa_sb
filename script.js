// ======================================================
// 1. CARREGAMENTO DE DADOS
// ======================================================
let escolasDB = [];

fetch('escolas.json')
    .then(response => response.json())
    .then(data => {
        escolasDB = data;
        console.log("Base de dados carregada:", escolasDB.length, "escolas.");
    })
    .catch(error => {
        console.error("Erro fatal: não foi possível carregar escolas.json", error);
        alert("Erro ao carregar a lista de escolas. Verifique se o arquivo escolas.json está na pasta.");
    });


// ======================================================
// 2. CONTROLE DE NAVEGAÇÃO E ESTADO
// ======================================================
let totalFilhos = 1;
let filhoAtual = 1;
let dadosFilhos = [];
let configTemp = {};
let historyStack = ['q1']; 

function navigateTo(nextId) {
    const currentId = historyStack[historyStack.length - 1];
    const currentEl = document.getElementById(currentId);
    
    currentEl.classList.remove('active');
    currentEl.classList.add('leaving');

    setTimeout(() => {
        currentEl.style.display = 'none';
        currentEl.classList.remove('leaving');
        
        const nextEl = document.getElementById(nextId);
        nextEl.style.display = 'block';
        
        if(nextId.startsWith('tpl-')) {
            document.querySelectorAll('.lbl-num').forEach(span => span.innerText = filhoAtual);
        }
        
        setTimeout(() => nextEl.classList.add('active'), 50);
    }, 400);

    historyStack.push(nextId);
}

function goBack() {
    if (historyStack.length <= 1) return;
    
    const currentId = historyStack.pop(); 
    const prevId = historyStack[historyStack.length - 1]; 

    if (currentId === 'tpl-tipo' && prevId === 'tpl-transporte') {
        filhoAtual--;
        dadosFilhos.pop(); 
    } else if (currentId === 'q-cep' && prevId === 'tpl-transporte') {
        dadosFilhos.pop(); 
    }

    const currentEl = document.getElementById(currentId);
    const prevEl = document.getElementById(prevId);

    currentEl.classList.remove('active');
    currentEl.style.display = 'none';
    
    prevEl.style.display = 'block';
    if(prevId.startsWith('tpl-')) {
        document.querySelectorAll('.lbl-num').forEach(span => span.innerText = filhoAtual);
    }
    
    setTimeout(() => prevEl.classList.add('active'), 50);
}

function startFlow() {
    const inputQtd = document.getElementById('inputQtd');
    totalFilhos = parseInt(inputQtd.value);
    
    if (isNaN(totalFilhos) || totalFilhos < 1) totalFilhos = 1;
    if (totalFilhos > 5) totalFilhos = 5;

    filhoAtual = 1;
    dadosFilhos = [];
    navigateTo('tpl-tipo');
}

function saveConfig(key, value) {
    configTemp[key] = value;
    
    if (key === 'tipo') {
        navigateTo('tpl-nivel');
    } else if (key === 'nivel') {
        navigateTo('tpl-transporte');
    } else if (key === 'transporte') {
        configTemp.id = filhoAtual;
        dadosFilhos.push({...configTemp});
        configTemp = {}; 

        if (filhoAtual < totalFilhos) {
            filhoAtual++;
            navigateTo('tpl-tipo');
        } else {
            const divMesma = document.getElementById('div-mesma-escola');
            divMesma.style.display = (totalFilhos > 1) ? 'block' : 'none';
            navigateTo('q-cep');
        }
    }
}


// ======================================================
// 3. LÓGICA DE GEOLOCALIZAÇÃO COM CACHE (IMPORTANTE)
// ======================================================

async function finalizar() {
    if (escolasDB.length === 0) {
        alert("A base de dados ainda está carregando...");
        return;
    }

    const inputCep = document.getElementById('inputCep');
    const cep = inputCep.value.replace(/\D/g, ''); 

    if (cep.length !== 8) { 
        alert('CEP inválido. Digite 8 números.'); 
        return; 
    }

    document.getElementById('loading-msg').style.display = 'block';

    try {
        const coords = await obterLatLon(cep);
        renderizarResultados(coords.lat, coords.lon);
    } catch (e) {
        console.error(e);
        alert("Não conseguimos localizar este CEP. Tente um vizinho.");
    } finally {
        document.getElementById('loading-msg').style.display = 'none';
    }
}

// --- SISTEMA DE CACHE ---
function getCacheCep(cep) {
    const cached = localStorage.getItem('cep_' + cep);
    if(cached) {
        return JSON.parse(cached);
    }
    return null;
}

function setCacheCep(cep, lat, lon) {
    const data = { lat: lat, lon: lon };
    localStorage.setItem('cep_' + cep, JSON.stringify(data));
}
// ------------------------

async function obterLatLon(cep) {
    // 1. Verifica se já buscamos esse CEP antes (CACHE)
    // Isso evita bloqueios do Nominatim
    const memoria = getCacheCep(cep);
    if (memoria) {
        console.log("CEP encontrado na memória (Cache)! Economizando requisição.");
        return memoria;
    }

    console.log("CEP novo. Consultando APIs externas...");

    // 2. TENTATIVA PRIORITÁRIA: Nominatim (OpenStreetMap)
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil&limit=1`;
        
        const r = await fetch(url, {
            headers: { 'User-Agent': 'PlanejadorEscolar/1.0' }
        });

        if (r.ok) {
            const d = await r.json();
            if (d.length > 0) {
                const lat = parseFloat(d[0].lat);
                const lon = parseFloat(d[0].lon);
                console.log("Sucesso via Nominatim!");
                
                // Salva na memória para a próxima vez
                setCacheCep(cep, lat, lon);
                return { lat, lon };
            }
        }
    } catch(e) {
        console.warn("Nominatim falhou ou bloqueou. Tentando backup...", e);
    }

    // 3. BACKUP: BrasilAPI
    console.log("Tentando BrasilAPI como backup...");
    try {
        const r2 = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
        if (r2.ok) {
            const d2 = await r2.json();
            if(d2.location && d2.location.coordinates) {
                 const lat = parseFloat(d2.location.coordinates.latitude);
                 const lon = parseFloat(d2.location.coordinates.longitude);
                 console.log("Sucesso via BrasilAPI!");

                 // Salva na memória também
                 setCacheCep(cep, lat, lon);
                 return { lat, lon };
            }
        }
    } catch(e) {
        console.warn("BrasilAPI também falhou.");
    }
    
    throw new Error("CEP não encontrado em nenhuma base.");
}


// ======================================================
// 4. RENDERIZAÇÃO E MAPA
// ======================================================

function renderizarResultados(latUser, lngUser) {
    const checkMesma = document.getElementById('checkMesma').checked;
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    // Filtra e Ordena
    let listaResultados = []; 

    dadosFilhos.forEach(filho => {
        let candidatas = escolasDB.filter(e => {
            const tipoMatch = (filho.tipo === 'ambos') || (e.type === filho.tipo);
            const nivelMatch = e.levels.includes(filho.nivel);
            return tipoMatch && nivelMatch;
        });

        // Distância Linear para ordenação inicial
        candidatas = candidatas.map(e => ({
            ...e, 
            distLinear: getDistancia(latUser, lngUser, e.lat, e.lng)
        }));
        
        candidatas.sort((a,b) => a.distLinear - b.distLinear);
        
        listaResultados.push({
            filho: filho,
            ranking: candidatas.slice(0, 3) 
        });
    });

    // Lógica "Mesma Escola"
    let escolaComum = null;
    let conflito = false;

    if (checkMesma && totalFilhos > 1) {
        let idsComuns = listaResultados[0].ranking.map(e => e.id);
        for(let i=1; i<listaResultados.length; i++) {
            let idsOutro = listaResultados[i].ranking.map(e => e.id);
            idsComuns = idsComuns.filter(id => idsOutro.includes(id));
        }

        if(idsComuns.length > 0) {
            escolaComum = escolasDB.find(e => e.id === idsComuns[0]);
        } else {
            conflito = true;
        }
    }

    // Desenha HTML
    document.getElementById('result-screen').style.display = 'block';
    
    // Configura Mapa
    if(window.mapaInstancia) { window.mapaInstancia.remove(); }
    
    const mapa = L.map('mapa').setView([latUser, lngUser], 13);
    window.mapaInstancia = mapa; 
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
    const layerGroup = L.layerGroup().addTo(mapa);
    
    L.marker([latUser, lngUser]).addTo(layerGroup).bindPopup("<b>Sua Casa</b>").openPopup();

    if (conflito) {
        container.innerHTML += `<div style="padding:15px; background:#fff5f5; color:#c53030; border-radius:8px; margin-bottom:15px; text-align:center;">
            ⚠️ Não encontramos uma única escola Top 3 compatível com todas as idades.
        </div>`;
    } else if (escolaComum) {
        container.innerHTML += `<div style="padding:15px; background:#f0fff4; color:#276749; border-radius:8px; margin-bottom:15px; text-align:center;">
            ✅ <strong>Logística Perfeita:</strong> A escola <u>${escolaComum.nome}</u> serve para todos!
        </div>`;
    }

    listaResultados.forEach((item, indexFilho) => {
        let htmlFilho = `<div class="child-result">
                            <h3 style="margin:0 0 15px 0; color:#2d3748; border-bottom:2px solid #edf2f7; padding-bottom:10px;">
                                🧒 Criança ${item.filho.id} <small>(${capitalizar(item.filho.nivel)})</small>
                            </h3>`;

        if(item.ranking.length === 0) {
            htmlFilho += `<p style="color:red">Nenhuma escola encontrada.</p></div>`;
            container.innerHTML += htmlFilho;
            return;
        }

        item.ranking.forEach((escola, rankIndex) => {
            const isBest = (rankIndex === 0);
            
            // Labels
            let badgeText = isBest ? "🏆 Melhor Opção" : (rankIndex === 1 ? "🥈 2ª Opção" : "🥉 3ª Opção");
            let badgeClass = isBest ? "badge-gold" : (rankIndex === 1 ? "badge-silver" : "badge-bronze");
            
            const isCommonHighlight = (escolaComum && escola.id === escolaComum.id);
            const extraStyle = isCommonHighlight ? "border: 2px solid #38a169; background:#f0fff4;" : "";
            if (isCommonHighlight) badgeText += " (Recomendada)";

            // IDs para AJAX
            const idCar = `car-${indexFilho}-${rankIndex}`;
            const idDist = `dist-${indexFilho}-${rankIndex}`;

            htmlFilho += `
                <div class="ranking-item rank-${rankIndex}" style="${extraStyle}">
                    <div class="badge-rank ${badgeClass}">${badgeText}</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:#2b6cb0; margin-top:5px;">${escola.nome}</div>
                    <div class="school-address">📍 ${escola.endereco || "Endereço não cadastrado"}</div>
                    <div class="data-grid">
                        <div class="data-item"><span class="data-label">Distância Real</span><span class="data-value" id="${idDist}">...</span></div>
                        <div class="data-item"><span class="data-label">Tempo Carro 🚗</span><span class="data-value" id="${idCar}">...</span></div>
                    </div>
                </div>
            `;

            // Marcador e Rota
            const marker = L.marker([escola.lat, escola.lng]).addTo(layerGroup);
            marker.bindPopup(`<b>${escola.nome}</b>`);

            if(isBest) {
                L.Routing.control({
                    waypoints: [L.latLng(latUser, lngUser), L.latLng(escola.lat, escola.lng)],
                    serviceUrl: 'https://router.project-osrm.org/route/v1',
                    lineOptions: { styles: [{color: getColor(indexFilho), opacity: 0.7, weight: 5}] },
                    createMarker: function() { return null; },
                    addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: false, show: false
                }).addTo(mapa);
            }

            // Busca detalhes da rota (OSRM)
            fetchDadosRota(latUser, lngUser, escola.lat, escola.lng, idCar, idDist);
        });

        htmlFilho += `</div>`;
        container.innerHTML += htmlFilho;
    });
}

// ======================================================
// 5. FUNÇÕES AUXILIARES
// ======================================================

function fetchDadosRota(lat1, lng1, lat2, lng2, idTempo, idDist) {
    fetch(`https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`)
        .then(r => r.json())
        .then(d => {
            if(d.routes && d.routes.length) {
                const distKm = (d.routes[0].distance / 1000).toFixed(1);
                const tempoCarroMin = Math.round(d.routes[0].duration / 60);
                
                const elDist = document.getElementById(idDist);
                const elTempo = document.getElementById(idTempo);
                if(elDist) elDist.innerText = distKm + " km";
                if(elTempo) elTempo.innerText = tempoCarroMin + " min";
            }
        })
        .catch(err => console.warn("Erro OSRM:", err));
}

function getDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2-lat1) * Math.PI / 180;
    const dLon = (lon2-lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
}

function getColor(i) {
    const colors = ['#3182ce', '#e53e3e', '#38a169', '#d69e2e', '#805ad5'];
    return colors[i % colors.length];
}

function capitalizar(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
