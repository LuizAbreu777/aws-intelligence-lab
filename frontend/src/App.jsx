import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, 
  FileText, 
  ScanText, 
  Send, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Server,
  Activity,
  Files,
  Image as ImageIcon,
  CloudLightning // Ícone novo para AWS
} from 'lucide-react';

// Função utilitária para obter a URL base com segurança
const getBaseUrl = () => {
  try {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  } catch (e) {
    return 'http://localhost:3000';
  }
};

const API_BASE_URL = getBaseUrl();
const POLL_BACKOFF_MS = [3000, 6000, 10000, 15000];
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const AWS_CHECK_COOLDOWN_MS = 30 * 1000;

export default function App() {
  // Estado de UI
  const [activeTab, setActiveTab] = useState('sentiment');
  
  // Estado de Dados
  const [inputText, setInputText] = useState('');
  const [language, setLanguage] = useState('pt'); 
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null); 
  
  // Estados para PDF Assíncrono
  const [s3Key, setS3Key] = useState('docs/exemplo.pdf');
  const [jobId, setJobId] = useState('');
  const [jobStage, setJobStage] = useState('');
  const [jobProgress, setJobProgress] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const pollInterval = useRef(null);
  const isPollingRef = useRef(false);
  const pollStartAtRef = useRef(null);
  const pollAttemptRef = useRef(0);
  const pollRequestInFlightRef = useRef(false);

  // Estados de Requisição
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null); 
  const [awsHealth, setAwsHealth] = useState(null); // Novo: Status da AWS
  const [awsCooldownLeft, setAwsCooldownLeft] = useState(0);
  const [useMockAws, setUseMockAws] = useState(() => {
    try {
      const saved = localStorage.getItem('useMockAws');
      if (saved == null) return true;
      return saved === 'true';
    } catch (e) {
      return true;
    }
  });
  const awsLastCheckAtRef = useRef(0);
  const awsCooldownTimerRef = useRef(null);

  // Limpeza de recursos
  useEffect(() => {
    return () => {
      if (pollInterval.current) clearTimeout(pollInterval.current);
      if (awsCooldownTimerRef.current) clearInterval(awsCooldownTimerRef.current);
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, []);

  // Handler de troca de abas
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setResponse(null);
    setError(null);
    setInputText('');
    setLanguage('pt');
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null);
    setFilePreview(null);
    setJobId('');
    setJobStage('');
    setJobProgress(0);
    stopPolling();
  };

  // --- FUNÇÕES DE API ---

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      setHealthStatus(res.ok ? 'ONLINE' : 'ERROR');
    } catch (e) {
      setHealthStatus('OFFLINE');
    }
  };

  // Chama health check ao montar
  useEffect(() => {
    checkHealth();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('useMockAws', String(useMockAws));
    } catch (e) {
      // ignore
    }
  }, [useMockAws]);

  // Função para testar conectividade AWS (Novo)
  const checkAwsConnectivity = async () => {
    const now = Date.now();
    const elapsed = now - awsLastCheckAtRef.current;
    if (elapsed < AWS_CHECK_COOLDOWN_MS) {
      setAwsCooldownLeft(Math.ceil((AWS_CHECK_COOLDOWN_MS - elapsed) / 1000));
      return;
    }

    awsLastCheckAtRef.current = now;
    setAwsCooldownLeft(Math.ceil(AWS_CHECK_COOLDOWN_MS / 1000));
    if (awsCooldownTimerRef.current) clearInterval(awsCooldownTimerRef.current);
    awsCooldownTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((AWS_CHECK_COOLDOWN_MS - (Date.now() - awsLastCheckAtRef.current)) / 1000);
      if (remaining <= 0) {
        clearInterval(awsCooldownTimerRef.current);
        awsCooldownTimerRef.current = null;
        setAwsCooldownLeft(0);
        return;
      }
      setAwsCooldownLeft(remaining);
    }, 1000);

    setAwsHealth('CHECKING');
    // Usamos uma chamada leve ao Comprehend para validar credenciais
    try {
      await callApi('/comprehend/sentiment', 'POST', { 
        text: 'AWS Connectivity Check', 
        languageCode: 'en' 
      });
      setAwsHealth('OK');
    } catch (e) {
      setAwsHealth('ERROR');
      // O erro detalhado já será setado pelo callApi e mostrado no terminal
    }
  };

  const callApi = async (endpoint, method = 'POST', body = null, isFileUpload = false) => {
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      const headers = {};
      let finalBody = body;

      headers['x-use-mock-aws'] = String(useMockAws);

      if (!isFileUpload && method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        finalBody = JSON.stringify(body);
      }

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: isFileUpload ? {} : headers,
        body: finalBody,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Erro ao comunicar com o servidor');
      }

      setResponse(data);
      return data;
    } catch (err) {
      console.error(err);
      setError(err.message || 'Falha na conexão com o Backend');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // --- HANDLERS DE AÇÃO ---

  const handleComprehend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    const endpoint = activeTab === 'sentiment' ? '/comprehend/sentiment' : '/comprehend/entities';
    callApi(endpoint, 'POST', { text: inputText, languageCode: language });
  };

  const insertExample = () => {
    setInputText("O atendimento na loja foi excelente e os produtos são de alta qualidade, porém a entrega demorou um pouco.");
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setResponse(null);
    }
  };

  const handleTextractUpload = (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    callApi('/textract/analyze', 'POST', formData, true);
  };

  // --- LÓGICA DE PDF ASSÍNCRONO ---

  const startPdfJob = async (e) => {
    e.preventDefault();
    stopPolling();
    try {
      const data = await callApi('/jobs', 'POST', {
        type: activeTab === 'pdf' ? 'pdf' : 'text',
        payload: { s3Key, languageCode: language, useMockAws }
      });
      if (data.jobId) {
        setJobId(data.jobId);
        setJobStage(data.stage || 'ingest');
        setJobProgress(data.progress || 0);
      }
    } catch (e) {
      // Erro já tratado no callApi
    }
  };

  const checkPdfStatus = async () => {
    if (!jobId) return;
    if (pollRequestInFlightRef.current) return;

    if (
      isPollingRef.current &&
      pollStartAtRef.current &&
      Date.now() - pollStartAtRef.current >= POLL_TIMEOUT_MS
    ) {
      setError('Polling interrompido após 5 minutos. Verifique o status manualmente.');
      stopPolling();
      return;
    }

    pollRequestInFlightRef.current = true;
    try {
      const data = await callApi(`/jobs/${jobId}`, 'GET');
      const job = data?.job;
      if (!job) throw new Error('Job não encontrado');

      setJobStage(job.stage || '');
      setJobProgress(Number(job.progress || 0));

      if (job.status === 'done' || job.status === 'failed') {
        stopPolling();
        return;
      }

      if (isPollingRef.current) {
        const idx = Math.min(pollAttemptRef.current, POLL_BACKOFF_MS.length - 1);
        const delay = POLL_BACKOFF_MS[idx];
        pollAttemptRef.current += 1;
        pollInterval.current = setTimeout(checkPdfStatus, delay);
      }
    } catch (e) {
      stopPolling();
    } finally {
      pollRequestInFlightRef.current = false;
    }
  };

  const startPolling = () => {
    if (!jobId || isPollingRef.current) return;
    if (pollInterval.current) clearTimeout(pollInterval.current);
    pollAttemptRef.current = 0;
    pollStartAtRef.current = Date.now();
    isPollingRef.current = true;
    setIsPolling(true);
    checkPdfStatus();
  };

  const stopPolling = () => {
    isPollingRef.current = false;
    setIsPolling(false);
    if (pollInterval.current) clearTimeout(pollInterval.current);
    pollInterval.current = null;
    pollStartAtRef.current = null;
    pollAttemptRef.current = 0;
  };

  // --- RENDERIZAÇÃO ---

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 selection:text-orange-600">
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-2.5 rounded-lg text-white shadow-orange-200 shadow-lg">
              <Server size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">AWS Services Demo</h1>
              <p className="text-xs text-slate-500 font-medium">Node.js Backend Integration</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Botão de Status Backend */}
            <button 
              onClick={checkHealth}
              className="flex items-center gap-2 text-xs font-mono bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-200 transition-colors"
              title="Verificar Backend (Localhost)"
            >
              <Activity size={14} className={healthStatus === 'ONLINE' ? 'text-green-500' : 'text-slate-400'} />
              <span className="hidden sm:inline">BACKEND:</span>
              <span>{healthStatus || 'CHECKING...'}</span>
            </button>

            {/* Novo Botão de Status AWS */}
            <button 
              onClick={checkAwsConnectivity}
              disabled={awsHealth === 'CHECKING' || awsCooldownLeft > 0}
              className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border transition-all
                ${awsHealth === 'OK' ? 'bg-orange-50 border-orange-200 text-orange-700' : 
                  awsHealth === 'ERROR' ? 'bg-red-50 border-red-200 text-red-700' : 
                  awsHealth === 'CHECKING' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                  'bg-slate-100 border-slate-200 text-slate-500 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200'}
                ${(awsHealth === 'CHECKING' || awsCooldownLeft > 0) ? 'opacity-70 cursor-not-allowed' : ''}
              `}
              title={awsCooldownLeft > 0 ? `Aguarde ${awsCooldownLeft}s para testar novamente` : "Testar Credenciais AWS"}
            >
              <CloudLightning size={14} className={awsHealth === 'CHECKING' ? 'animate-pulse' : ''} />
              <span className="hidden sm:inline">AWS:</span>
              <span>
                {awsHealth === 'OK' ? 'CONECTADO' : 
                 awsHealth === 'ERROR' ? 'FALHA' : 
                 awsHealth === 'CHECKING' ? 'TESTANDO...' : 'TESTAR'}
              </span>
              {awsCooldownLeft > 0 && awsHealth !== 'CHECKING' && (
                <span className="hidden sm:inline">({awsCooldownLeft}s)</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setUseMockAws((prev) => !prev)}
              className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border transition-colors
                ${useMockAws
                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
              title="Alternar entre modo MOCK e AWS real"
            >
              <span className="hidden sm:inline">MODE:</span>
              <span>{useMockAws ? 'MOCK' : 'AWS REAL'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Navegação de Abas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <TabButton 
            active={activeTab === 'sentiment'} 
            onClick={() => handleTabChange('sentiment')}
            icon={<Brain size={18} />}
            title="Sentimento"
            desc="Comprehend"
          />
          <TabButton 
            active={activeTab === 'entities'} 
            onClick={() => handleTabChange('entities')}
            icon={<ScanText size={18} />}
            title="Entidades"
            desc="Comprehend"
          />
          <TabButton 
            active={activeTab === 'textract'} 
            onClick={() => handleTabChange('textract')}
            icon={<ImageIcon size={18} />}
            title="OCR Imagem"
            desc="Textract Sync"
          />
          <TabButton 
            active={activeTab === 'pdf'} 
            onClick={() => handleTabChange('pdf')}
            icon={<Files size={18} />}
            title="PDF Async"
            desc="Textract S3"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Coluna da Esquerda: Formulários (5 colunas) */}
          <section className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                {activeTab === 'sentiment' && 'Análise de Sentimento'}
                {activeTab === 'entities' && 'Extração de Entidades'}
                {activeTab === 'textract' && 'OCR de Imagem'}
                {activeTab === 'pdf' && 'Processamento de PDF'}
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                {activeTab === 'sentiment' && 'Detecta emoções positivas, negativas ou neutras.'}
                {activeTab === 'entities' && 'Identifica pessoas, marcas, locais e datas.'}
                {activeTab === 'textract' && 'Extrai texto impresso ou manuscrito de imagens.'}
                {activeTab === 'pdf' && 'Pipeline assíncrona em estágios (ingest → ocr → nlp).'}
              </p>

              {/* Formulário Comprehend */}
              {(activeTab === 'sentiment' || activeTab === 'entities') && (
                <form onSubmit={handleComprehend}>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-slate-700">Texto</label>
                    <select 
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="text-xs border rounded px-2 py-1 bg-slate-50 outline-none focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="pt">Português (PT)</option>
                      <option value="en">Inglês (EN)</option>
                    </select>
                  </div>
                  
                  <textarea
                    className="w-full h-40 p-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all resize-none text-sm mb-3"
                    placeholder="Digite o texto aqui..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  
                  <div className="flex justify-between items-center">
                    <button 
                      type="button" 
                      onClick={insertExample}
                      className="text-xs text-orange-600 hover:text-orange-700 font-medium hover:underline"
                    >
                      Inserir Exemplo
                    </button>
                    <Button loading={loading} disabled={!inputText.trim()} />
                  </div>
                </form>
              )}

              {/* Formulário Textract Imagem */}
              {activeTab === 'textract' && (
                <form onSubmit={handleTextractUpload}>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Arquivo de Imagem
                  </label>
                  
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50 hover:bg-slate-100 transition-colors relative mb-4">
                    <input 
                      type="file" 
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center gap-2">
                      <ImageIcon className="text-slate-400" size={32} />
                      <span className="text-sm text-slate-600 font-medium truncate max-w-full px-2">
                        {selectedFile ? selectedFile.name : 'Clique para selecionar'}
                      </span>
                    </div>
                  </div>

                  {filePreview && (
                    <div className="mb-4 bg-slate-100 rounded-lg p-2 border border-slate-200">
                      <p className="text-xs text-slate-500 mb-1 font-medium ml-1">Preview:</p>
                      <img src={filePreview} alt="Preview" className="w-full h-32 object-contain rounded bg-white" />
                    </div>
                  )}
                  
                  <div className="flex justify-end">
                    <Button loading={loading} disabled={!selectedFile} text="Extrair Texto" />
                  </div>
                </form>
              )}

              {/* Formulário Textract PDF (Async) */}
              {activeTab === 'pdf' && (
                <form onSubmit={startPdfJob}>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Caminho no S3 (Bucket Default)
                  </label>
                  <div className="flex gap-2 mb-4">
                    <input 
                      type="text" 
                      className="flex-1 p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-orange-500"
                      value={s3Key}
                      onChange={(e) => setS3Key(e.target.value)}
                      placeholder="docs/arquivo.pdf"
                    />
                  </div>

                  <div className="flex justify-end mb-6">
                    <Button loading={loading && !jobId} disabled={!s3Key.trim()} text="Criar Job na Pipeline" />
                  </div>

                  {jobId && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                      <h3 className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-2">Controle do Job</h3>
                      <p className="text-xs font-mono text-slate-600 mb-3 break-all bg-white p-1 rounded border border-orange-100">
                        ID: {jobId}
                      </p>
                      <p className="text-xs text-slate-700 mb-3">
                        Stage: <span className="font-mono">{jobStage || 'ingest'}</span> | Progress: <span className="font-mono">{jobProgress}%</span>
                      </p>
                      
                      <div className="flex gap-2">
                        {!isPolling ? (
                          <button 
                            type="button"
                            onClick={startPolling}
                            className="flex-1 bg-orange-600 text-white text-xs font-bold py-2 rounded hover:bg-orange-700 transition-colors"
                          >
                            Iniciar Polling (Backoff)
                          </button>
                        ) : (
                          <button 
                            type="button"
                            onClick={stopPolling}
                            className="flex-1 bg-red-500 text-white text-xs font-bold py-2 rounded hover:bg-red-600 transition-colors"
                          >
                            Parar Polling
                          </button>
                        )}
                        <button 
                          type="button"
                          onClick={checkPdfStatus}
                          className="px-3 bg-white border border-slate-300 text-slate-700 text-xs font-bold py-2 rounded hover:bg-slate-50"
                          title="Verificar uma vez"
                        >
                          <Activity size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Aviso AWS */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-800 leading-relaxed">
              <strong className="flex items-center gap-1.5 mb-1 text-blue-900">
                <AlertCircle size={14} /> Nota de Arquitetura:
              </strong>
              Este front-end envia requisições para <code>{API_BASE_URL}</code>. O backend utiliza o SDK da AWS. Nenhuma credencial trafega pelo navegador.
            </div>
          </section>

          {/* Coluna da Direita: Terminal (7 colunas) */}
          <section className="lg:col-span-7 h-full min-h-[500px]">
            <div className={`h-full bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col`}>
              
              {/* Toolbar do Terminal */}
              <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700">
                <span className="text-xs text-slate-400 font-mono flex items-center gap-2">
                  <FileText size={12} />
                  JSON Response Output
                </span>
                <div className="flex items-center gap-3">
                  {loading && <span className="text-xs text-orange-400 animate-pulse">Carregando...</span>}
                  {response && <span className="text-xs text-green-400">Status: 200 OK</span>}
                  <div className="flex gap-1.5 ml-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500"></div>
                  </div>
                </div>
              </div>

              {/* Área de Conteúdo */}
              <div className="p-4 overflow-auto flex-1 w-full font-mono text-sm custom-scrollbar relative">
                
                {loading && !response && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/50 backdrop-blur-sm z-10">
                    <Loader2 size={32} className="animate-spin text-orange-500 mb-3" />
                    <p className="text-xs">Processando requisição...</p>
                  </div>
                )}

                {error && (
                  <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
                     <div className="text-red-300 bg-red-900/30 border border-red-800/50 p-4 rounded-lg mb-4">
                      <strong className="flex items-center gap-2 mb-2 text-red-200"><AlertCircle size={16}/> Erro:</strong>
                      <p className="whitespace-pre-wrap">{error}</p>
                    </div>
                    {/subscription|registration/i.test(error) && (
                      <div className="text-amber-300 bg-amber-900/30 border border-amber-800/50 p-4 rounded-lg">
                        <strong>⚠️ Alerta AWS:</strong> Serviço não ativado na conta AWS configurada no backend.
                      </div>
                    )}
                  </div>
                )}

                {response && (
                  <div className="animate-in fade-in duration-500">
                    <pre className="text-slate-300 whitespace-pre-wrap break-all text-xs leading-5">
                      {JSON.stringify(response, null, 2)}
                    </pre>
                  </div>
                )}

                {!loading && !response && !error && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                    <Server size={48} className="mb-4" strokeWidth={1} />
                    <p>Aguardando interação...</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// --- COMPONENTES AUXILIARES ---

function TabButton({ active, onClick, icon, title, desc }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center sm:items-start p-3 rounded-xl border transition-all duration-200 text-center sm:text-left h-full
        ${active 
          ? 'bg-white border-orange-500 ring-1 ring-orange-500 shadow-md transform -translate-y-0.5' 
          : 'bg-white border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-500'
        }
      `}
    >
      <div className={`mb-1.5 ${active ? 'text-orange-600' : 'text-slate-400'}`}>
        {icon}
      </div>
      <span className={`font-bold text-xs sm:text-sm block w-full ${active ? 'text-slate-900' : 'text-slate-600'}`}>
        {title}
      </span>
      <span className="text-[10px] hidden sm:block mt-0.5 opacity-80">{desc}</span>
    </button>
  );
}

function Button({ loading, disabled, text = "Analisar" }) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className={`
        flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wide transition-all
        ${disabled 
          ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
          : 'bg-orange-600 hover:bg-orange-700 text-white shadow-md hover:shadow-lg active:scale-95'
        }
      `}
    >
      {loading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Processando...
        </>
      ) : (
        <>
          <Send size={14} />
          {text}
        </>
      )}
    </button>
  );
}
