
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { WorkflowNode, TaskStatus, Project, ArchiveItem } from '../types';
import { CheckCircle2, Clock, AlertCircle, FileText, Edit2, Save, X, Calendar, Sparkles, Loader2, Target, Zap } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface ProjectSummaryProps {
  project: Project;
  nodes: WorkflowNode[];
  archives?: ArchiveItem[]; 
  onUpdateProject?: (project: Project) => void;
}

const ProjectSummary: React.FC<ProjectSummaryProps> = ({ project, nodes, archives = [], onUpdateProject }) => {
  const [isEditingRisk, setIsEditingRisk] = useState(false);
  const [riskText, setRiskText] = useState(project.keyRisks || '');
  
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState(project.currentPhaseDeadline || '');

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
      if (!isEditingRisk) {
          setRiskText(project.keyRisks || '');
      }
  }, [project.keyRisks, isEditingRisk]);

  useEffect(() => {
      if (!isEditingDeadline) {
          setDeadlineDate(project.currentPhaseDeadline || '');
      }
  }, [project.currentPhaseDeadline, isEditingDeadline]);

  const completed = nodes.filter(n => n.status === TaskStatus.COMPLETED).length;
  const inProgress = nodes.filter(n => n.status === TaskStatus.IN_PROGRESS).length;
  const pending = nodes.filter(n => n.status === TaskStatus.PENDING).length;
  const blocked = nodes.filter(n => n.status === TaskStatus.BLOCKED).length;
  const total = nodes.length;
  
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const criticalPending = nodes.filter(n => n.isKeyNode && n.status !== TaskStatus.COMPLETED).length;
  const criticalTotal = nodes.filter(n => n.isKeyNode).length;

  const data = [
    { name: '已完成', value: completed, color: '#10b981' },
    { name: '进行中', value: inProgress, color: 'var(--color-primary-500)' }, 
    { name: '待处理', value: pending, color: 'var(--color-primary-200)' },
    { name: '受阻', value: blocked, color: '#ef4444' },
  ];

  const handleAIAnalysis = async () => {
      setIsAnalyzing(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const prompt = `你是一个资深的厨房设备工程专家。请根据以下项目数据进行简短的深度分析（不超过150字）：
          项目名称: ${project.name}
          当前总进度: ${progress}%
          已完成节点: ${completed}
          进行中节点: ${inProgress}
          受阻/逾期节点: ${blocked}
          待处理节点: ${pending}
          关键风险记录: ${project.keyRisks || '无'}
          合同到期日: ${project.deadline}
          
          请指出目前的核心风险点，并给出一条针对性的专家建议。`;

          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt
          });

          setAiInsight(response.text || "AI 诊断未能生成有效内容。");
      } catch (e) {
          setAiInsight("AI 分析暂时不可用，请重试。");
      } finally {
          setIsAnalyzing(false);
      }
  };

  const calculateDaysRemaining = (targetDate: string) => {
      if (!targetDate) return null;
      try {
          const target = new Date(targetDate + 'T00:00:00');
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const todayMidnight = new Date(todayStr + 'T00:00:00');
          const diffTime = target.getTime() - todayMidnight.getTime();
          return Math.round(diffTime / (1000 * 60 * 60 * 24)); 
      } catch (e) {
          return null;
      }
  };
  
  const daysRemaining = calculateDaysRemaining(deadlineDate);

  const handleSaveRisk = () => {
      if (onUpdateProject) {
          onUpdateProject({ ...project, keyRisks: riskText });
      }
      setIsEditingRisk(false);
  };

  const handleSaveDeadline = () => {
      if (onUpdateProject) {
          onUpdateProject({ ...project, currentPhaseDeadline: deadlineDate });
      }
      setIsEditingDeadline(false);
  };

  return (
    <div className="space-y-6 mb-8 transition-all">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Progress Card */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm transition-all duration-300 hover:border-primary-400 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 hover:shadow-xl group">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[10px] font-black text-slate-400 group-hover:text-primary-500 uppercase tracking-widest transition-colors">项目履约进度</h3>
            <Target className="w-4 h-4 text-primary-500 opacity-30" />
          </div>
          <div className="flex items-center justify-between">
            <div className="relative w-32 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={45}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-2xl font-black text-slate-800 dark:text-white group-hover:scale-110 transition-transform leading-none">{progress}%</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase mt-1">Total</p>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-[10px] font-black uppercase tracking-tighter">
               <div className="flex items-center text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2"></span>
                  {completed} 已完工
               </div>
               <div className="flex items-center text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary-500 mr-2"></span>
                  {inProgress} 执行中
               </div>
               <div className="flex items-center text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary-200 dark:bg-primary-900 mr-2"></span>
                  {pending} 待激活
               </div>
            </div>
          </div>
        </div>

        {/* Engineering Health KPI */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between transition-all duration-300 hover:border-red-400 hover:bg-red-50/30 dark:hover:bg-red-900/10 hover:shadow-xl group">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <h3 className="text-[10px] font-black text-slate-400 group-hover:text-red-600 uppercase tracking-widest transition-colors">核心质量管控状态</h3>
                    <div className="flex items-baseline gap-2 mt-2">
                        <span className={`text-4xl font-black tracking-tighter ${criticalPending > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {criticalPending}
                        </span>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">/ {criticalTotal} 待办</span>
                    </div>
                </div>
                <div className={`p-3 rounded-2xl ${criticalPending > 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600'}`}>
                    <Zap className={`w-6 h-6 ${criticalPending > 0 ? 'animate-pulse' : ''}`} />
                </div>
            </div>
            <div className="mt-4">
                <div className="w-full bg-slate-100 dark:bg-slate-900 h-2 rounded-full overflow-hidden shadow-inner">
                    <div 
                        className={`h-full transition-all duration-1000 ${criticalPending > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                        style={{ width: `${Math.round(((criticalTotal - criticalPending) / criticalTotal) * 100)}%` }}
                    />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase mt-2 tracking-widest">关键节点销项率: {Math.round(((criticalTotal - criticalPending) / criticalTotal) * 100)}%</p>
            </div>
        </div>

        {/* Contract Countdown */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between transition-all duration-300 hover:border-primary-400 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 hover:shadow-xl group">
          <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                  <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-xl transition-colors group-hover:bg-primary-600 group-hover:text-white">
                      <Calendar className="w-5 h-5 text-primary-600 dark:text-primary-400 group-hover:text-white" />
                  </div>
                  <h3 className="text-[10px] font-black text-slate-400 group-hover:text-primary-500 uppercase tracking-widest transition-colors">合同到期日</h3>
              </div>
              {onUpdateProject && !isEditingDeadline && (
                  <button onClick={() => setIsEditingDeadline(true)} className="text-slate-300 hover:text-primary-600 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                  </button>
              )}
          </div>
          
          {isEditingDeadline ? (
               <div className="mt-4 animate-in slide-in-from-top-1">
                   <input 
                      type="date" 
                      className="border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm w-full outline-none focus:border-primary-500 transition-all font-bold"
                      value={deadlineDate}
                      onChange={e => setDeadlineDate(e.target.value)}
                   />
                   <div className="flex justify-end gap-2 mt-3">
                      <button onClick={() => setIsEditingDeadline(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                      <button onClick={handleSaveDeadline} className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Save className="w-4 h-4" /></button>
                   </div>
               </div>
          ) : (
               <div className="mt-2 flex flex-col h-full justify-center">
                  {deadlineDate ? (
                      <>
                          <div className="flex items-baseline gap-2 mb-1">
                              {daysRemaining === 0 ? (
                                  <span className="text-3xl font-black tracking-tight text-orange-500">今天</span>
                              ) : (
                                  <>
                                      <span className={`text-4xl font-black tracking-tighter transition-colors ${daysRemaining! < 0 ? 'text-red-600' : daysRemaining! < 7 ? 'text-orange-500' : 'text-primary-600'}`}>
                                          {Math.abs(daysRemaining!)}
                                      </span>
                                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">天</span>
                                  </>
                              )}
                              <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${daysRemaining! < 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-800'}`}>
                                  {daysRemaining! < 0 ? '已逾期' : daysRemaining === 0 ? '交付日' : '剩余时间'}
                              </span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-1.5">
                             <Clock className="w-3.5 h-3.5 text-primary-500 opacity-60" /> {deadlineDate}
                          </p>
                      </>
                  ) : (
                      <div className="text-center py-4">
                          <p className="text-slate-400 text-xs italic font-bold mb-2">未设定交付日期</p>
                          {onUpdateProject && (
                              <button onClick={() => setIsEditingDeadline(true)} className="text-[10px] font-black uppercase text-primary-600 hover:underline tracking-widest">立即配置</button>
                          )}
                      </div>
                  )}
               </div>
          )}
        </div>

        {/* Key Risks */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between transition-all duration-300 hover:border-orange-400 hover:bg-orange-50/30 dark:hover:bg-orange-900/10 hover:shadow-xl group border-l-[12px] border-l-orange-500">
          <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-xl transition-colors group-hover:bg-orange-600 group-hover:text-white">
                      <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 group-hover:text-white" />
                  </div>
                  <h3 className="text-[10px] font-black text-slate-400 group-hover:text-orange-500 uppercase tracking-widest transition-colors">实时风险监测</h3>
              </div>
              {onUpdateProject && !isEditingRisk && (
                  <button onClick={() => setIsEditingRisk(true)} className="text-slate-300 hover:text-primary-600 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                  </button>
              )}
          </div>

          {isEditingRisk ? (
              <div className="mt-2 animate-in slide-in-from-top-1">
                  <textarea 
                      className="w-full text-sm border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-xl p-3 outline-none focus:border-primary-500 transition-all font-bold resize-none"
                      rows={3}
                      value={riskText}
                      onChange={e => setRiskText(e.target.value)}
                  />
                  <div className="flex justify-end gap-2 mt-1">
                      <button onClick={() => setIsEditingRisk(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                      <button onClick={handleSaveRisk} className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Save className="w-4 h-4" /></button>
                  </div>
              </div>
          ) : (
              <div className="mt-2 h-full flex flex-col justify-center">
                  <p className="text-xs font-black text-slate-700 dark:text-slate-200 line-clamp-3 leading-relaxed transition-colors group-hover:text-slate-900 dark:group-hover:text-white">
                     {project.keyRisks || '暂无活跃风险记录。建议及时记录图纸偏差、水电位冲突等施工现场异常。'}
                  </p>
              </div>
          )}
        </div>
      </div>

      {/* AI Analysis Section - Compact Version */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-5 md:p-6 rounded-2xl md:rounded-3xl shadow-xl relative overflow-hidden group transition-all duration-500 hover:from-primary-500 hover:to-primary-700">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-2xl transition-all duration-700 group-hover:opacity-40 group-hover:scale-125" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
              <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-3">
                      <div className="p-1.5 bg-white/20 backdrop-blur-md rounded-xl border border-white/30">
                        <Sparkles className="w-5 h-5 text-white animate-pulse" />
                      </div>
                      <h3 className="text-base md:text-lg font-black text-white uppercase tracking-tight">Gemini 智能工程诊断</h3>
                  </div>
                  {aiInsight ? (
                      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/20 animate-in fade-in slide-in-from-top-2">
                          <p className="text-xs md:text-sm font-medium text-primary-50 leading-relaxed italic">
                              "{aiInsight}"
                          </p>
                      </div>
                  ) : (
                      <p className="text-primary-100 text-xs md:text-sm font-bold opacity-80 max-w-2xl leading-relaxed">
                          利用 Google Gemini 大模型能力，实时诊断项目交付风险，生成资深工程专家的预警建议。
                      </p>
                  )}
              </div>
              <div className="shrink-0 flex flex-col items-center">
                  <button 
                      onClick={handleAIAnalysis}
                      disabled={isAnalyzing}
                      className="bg-white text-primary-700 px-6 py-3 rounded-xl font-black shadow-lg hover:bg-primary-50 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 border-2 border-transparent hover:border-white/50 text-xs uppercase tracking-widest"
                  >
                      {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>诊断中...</span>
                          </>
                      ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>生成诊断报告</span>
                          </>
                      )}
                  </button>
                  {aiInsight && (
                      <button 
                          onClick={() => setAiInsight(null)}
                          className="mt-3 block w-full text-center text-[9px] font-black text-white/60 hover:text-white uppercase tracking-widest transition-colors"
                      >
                          清除分析
                      </button>
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};

export default ProjectSummary;
