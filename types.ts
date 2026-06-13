export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED'
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  uploadDate: string;
  type: string;
  size: string;
  category?: ArchiveCategory; 
  base64Data?: string; // 临时存储用于 AI 直接读取
}

export interface Memo {
  id: string;
  content: string;
  createdAt: string;
  author: string;
}

export interface WorkflowNode {
  id: string;
  title: string;
  description?: string;
  phase: string;
  status: TaskStatus;
  attachments: Attachment[];
  memos: Memo[];
  isKeyNode?: boolean;
  deadline?: string;
  assignee?: string; 
  createdAt?: string; 
}

export interface Project {
  id: string;
  name: string;
  code: string;
  contractNo?: string; 
  internalContractNo?: string; 
  clientName: string;
  manager: string;
  startDate: string;
  deadline: string;
  status: 'Active' | 'Completed' | 'Pending';
  progress: number;
  nodes: WorkflowNode[]; 
  keyRisks?: string;
  currentPhaseDeadline?: string;
  createdAt?: string; 
}

export interface Contact {
  id: string;
  name: string;
  role: string; 
  phone: string;
  email: string;
}

export interface Client {
  id: string;
  companyName: string;
  address: string;
  type: 'Hotel' | 'Restaurant' | 'Canteen' | 'Government' | 'SchoolCanteen' | 'SOE' | 'Private' | 'Other';
  contacts: Contact[];
  createdAt: string;
  creatorId?: string; 
}

export interface Equipment {
  id: string;
  name: string;
  model: string;
  brand: string;
  category: string; 
  dimensions: string; 
  powerSpecs: string; 
  waterGasSpecs?: string; 
  description?: string;
  imageUrl?: string;
  createdAt?: string;
}

export interface DocItem {
  id: string;
  title: string;
  category: 'Standard' | 'Regulation' | 'Manual' | 'Template' | 'Experience';
  fileType: string;
  size: string;
  updatedAt: string;
  url?: string; 
  content?: string; 
  createdAt?: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time: string;
  type: 'Meeting' | 'SiteVisit' | 'Deadline' | 'Other';
  projectId?: string; 
  assignee?: string; 
  isCompleted: boolean;
  userId?: string;
  createdAt?: string;
}

export type ArchiveCategory = 
  | 'Drawing'       
  | 'Contract'      
  | 'Invoice'       
  | 'List'          
  | 'ContactForm'   
  | 'Inspection'    
  | 'Acceptance'    
  | 'Audit'         
  | 'Settlement'    
  | 'AuditMaterial'
  | 'WinningNotice' 
  | 'SignOff'       
  | 'Training'      
  | 'Other';        

export interface ArchiveItem {
  id: string;
  title: string;
  category: ArchiveCategory;
  projectName: string; 
  projectId?: string; 
  fileType: string; 
  size: string;
  uploadDate: string;
  uploader: string;
  url?: string; 
  createdAt?: string;
}

export type ProductionStatus = 'Waiting' | 'InStock' | 'Shipped';

export interface ProductionUnit {
  id: string;
  name: string;
  model: string;
  quantity: number;
  status: ProductionStatus;
  batchDate?: string; 
  notes?: string;
  createdAt?: string;
}

export interface ProjectProduction {
  id?: string; 
  projectId: string;
  projectName: string;
  projectCode: string;
  items: ProductionUnit[];
  createdAt?: string;
}

export interface PaymentRecord {
  id: string;
  projectId?: string; 
  projectName: string;
  managerName: string;
  clientContactName: string;
  contractAmount: number; 
  variationAmount: number;
  submissionAmount: number;
  auditedAmount: number; 
  paymentTerms: string;
  receivedAmount: number;
  finalPaymentDueDate: string;
  invoicedAmount: number;
  warrantyPeriod?: string; 
  creatorId?: string; 
  createdAt?: string;
}

export interface User {
  id: string;
  nickname: string;
  password?: string;
  department: string;
  role: UserRole;
  permission?: UserPermission;
  isDefaultAdmin?: boolean;
  avatar: string;
  lastReadMap?: Record<string, string>;
  lastActive?: string; 
  pushToken?: string; 
  preferences?: UserPreferences;
}

export type UserRole = 'Admin' | 'DeptManager' | 'Manager' | 'User';
export type UserPermission = 'Read' | 'ReadWrite';

export type ThemeColor = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan';

export interface NotificationWebhooks {
  pushPlusToken?: string;
  wecomWebhook?: string;
  dingtalkWebhook?: string;
  dingtalkSecret?: string;
}

export interface UserPreferences {
  enableBrowser: boolean; 
  sound: boolean;
  themeColor: ThemeColor;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  timeFormat: '12h' | '24h';

  numberFormat: {
    decimalPlaces: number;
    useThousandsSeparator: boolean;
    currencySymbol: '¥' | '$' | '€' | '£';
  };

  weatherLocation: {
    mode: 'auto' | 'manual' | 'custom';
    city?: string;
    latitude?: number;
    longitude?: number;
  };

  types: {
    chat: boolean;      
    approval: boolean;  
    task: boolean;      
    system: boolean;    
  };

  webhooks?: NotificationWebhooks;

  // AI 接口密钥存储 (Google GenAI Keys handled exclusively by process.env.API_KEY)
  aiKeys?: {
    siliconFlow?: string;
  };
}

export interface AppSettings {
  id?: string; 
  appName: string;
  logoUrl: string;
  logoWidth: number;
  poweredByText?: string; 
  erpBaseUrl?: string; 
}

export type NotificationType = 'success' | 'error' | 'info';
export type NotificationCategory = 'System' | 'Chat' | 'Approval' | 'Task'; 

export interface Notification {
  id: string;
  message: string;
  details?: string; 
  type: NotificationType;
  category?: NotificationCategory; 
  timestamp: string;
  read: boolean;
  isVisible: boolean;
  relatedId?: string; 
}

export type ApprovalType = 'Procurement' | 'Expense' | 'Leave' | 'Engineering' | 'Deletion' | 'Other';
export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Draft' | 'Returned';
export type ApproverType = 'Department' | 'Person';

export type ApprovalStrategy = 'SEQUENTIAL' | 'PARALLEL' | 'JOINT' | 'OR_SIGN';

export interface ApprovalOutcome {
    status: 'Approved' | 'Rejected' | 'Returned';
    approverId: string;
    approverName: string;
    comment: string;
    date: string;
}

export interface ApprovalVersion {
    version: number;
    content: string;
    attachments: Attachment[];
    submittedAt: string;
    outcomes: ApprovalOutcome[]; 
}

export interface ApprovalTemplate {
  id: string;
  name: string;
  type: ApprovalType;
  defaultTitle: string;
  defaultContent: string;
  defaultStrategy: ApprovalStrategy;
}

export interface Approval {
  id: string;
  title: string;
  type: ApprovalType;
  applicantId: string;
  applicantName: string;
  department: string;
  
  strategy: ApprovalStrategy; 
  approverIds: string[];      
  approverNamesDisplay: string; 

  status: ApprovalStatus;
  
  currentContent: string;
  currentAttachments: Attachment[];
  
  versions: ApprovalVersion[]; 
  
  createdAt: string;
  updatedAt: string;

  relatedId?: string; 
  relatedType?: string; 
  
  lastNotifiedAt?: string;
  timeoutReminderCount?: number;
}

export type AttendanceStatus = 'Present' | 'Leave' | 'Sick' | 'BusinessTrip' | 'Remote' | 'PublicHoliday' | 'Vacation' | 'Outsourced';

export interface WorkLogEntry {
  id: string;
  userId: string;
  userName: string;
  date: string;
  content: string;
  duration: number;
  status: AttendanceStatus;
  createdAt: string;
}

export type MessageType = 'text' | 'image' | 'file' | 'system';

export interface ChatMessage {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  type?: MessageType; 
  timestamp: string;
  attachments?: Attachment[];
  
  relatedId?: string; 
  relatedType?: 'Project' | 'Order' | 'Task' | 'Approval';
}

export type ChannelType = 'General' | 'Project' | 'Group' | 'Private';

export interface ChatChannel {
  id: string;
  name: string;
  type: ChannelType;
  projectId?: string; 
  participants?: string[]; 
  admins?: string[]; 
  creatorId?: string;
  createdAt?: string;
}

export interface ChatAnnouncement {
  id: string;
  channelId?: string; 
  content: string;
  isPinned: boolean;
  creatorId: string;
  creatorName: string;
  createdAt: string;
}

export interface EmailConfig {
  id: string; 
  email: string;
  authCode: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: any; 
  checksum?: string;
}

export interface EmailMessage {
  id: string; 
  from: string;
  to: string;
  subject: string;
  date: string;
  text: string;
  html?: string;
  seen: boolean;
  attachments?: EmailAttachment[];
}

export interface RecycleBinItem {
  id: string;
  originalId: string;
  resourceType: string;
  name: string;
  deletedAt: string;
  deletedBy: string;
  data: any;
}