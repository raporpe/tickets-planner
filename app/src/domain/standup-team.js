import { isDone } from './sprint-policy.js';

export const STANDUP_TEAM = [
  {
    id: 'pboyanoivars',
    name: 'Paula Boyano',
    fullName: 'Paula Boyano Ivars',
    initials: 'PB',
    email: 'pboyanoivars@microsoft.com',
    aliases: ['pboyanoivars@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.YTllYTM0MGEtZGI1Yy03YzQ1LTg2OGQtMDVlMDU0MTAwZWI3?size=2',
  },
  {
    id: 'raulpo',
    name: 'Raul Portugues',
    fullName: 'Raul Portugues del Peno',
    initials: 'RP',
    email: 'raulpo@microsoft.com',
    aliases: ['raulpo@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.OTVhZWZhMDEtNDRmMC03NzVmLWI3NGMtYmQ2M2M3YTIyNDlj?size=2',
  },
  {
    id: 'soranalatas',
    name: 'Soran Alatas',
    fullName: 'Soran Zana Alatas',
    initials: 'SA',
    email: 'soranalatas@microsoft.com',
    aliases: ['soranalatas@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.MDc3ZGE4NmUtOWQ2Yy03MzZmLWE2MDAtZWNkNDYyNmU5ZTZh?size=2',
  },
  {
    id: 'amarchesin',
    name: 'Angelo Marchesin',
    fullName: 'Angelo Marchesin',
    initials: 'AM',
    email: 'marchesin.angelo@microsoft.com',
    aliases: ['amarchesin@microsoft.com', 'marchesin.angelo@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.Nzc1ZDdmMjUtMzU4Zi03YmY3LTkyZTMtNzE5MDA1NWU2NWYy?size=2',
  },
  {
    id: 'gfornonssera',
    name: 'Gemma Fornons',
    fullName: 'Gemma Fornons Sera',
    initials: 'GF',
    email: 'gfornonssera@microsoft.com',
    aliases: ['gfornonssera@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.OWFlMTRkODktOWE3ZS03NTQ2LWI0OWUtYmNjMmJjZDNlNDBi?size=2',
  },
  {
    id: 'nlattuada',
    name: 'Nicolas Lattuada',
    fullName: 'Nicolas Lattuada',
    initials: 'NL',
    email: 'nlattuada@microsoft.com',
    aliases: ['nlattuada@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.YzRlYzZkMzktZmUxMy03NjEyLTg5ZmEtNDk3MjY1YzBmMWY4?size=2',
  },
  {
    id: 'gemarques',
    name: 'George Marques',
    fullName: 'George Marques',
    initials: 'GM',
    email: 'gemarques@microsoft.com',
    aliases: ['gemarques@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.NDgzODU4OGQtZGI5OC03MGUzLThmNTEtOTJhNWI3YmVlMTgx?size=2',
  },
  {
    id: 'masaucaortiz',
    name: 'Marina Sauca',
    fullName: 'Marina Sauca Ortiz',
    initials: 'MS',
    email: 'masaucaortiz@microsoft.com',
    aliases: ['masaucaortiz@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.OTFiNjI1NmUtZWZiNi03YWEyLTgyNDQtZWQyZTAwNDIzOGFm?size=2',
  },
  {
    id: 'tianpli',
    name: 'Tianpei Li',
    fullName: 'Tianpei Li',
    initials: 'TL',
    email: 'tianpli@microsoft.com',
    aliases: ['tianpli@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.YmY4MDlkZDUtZDA2Zi03ZTgzLWEwMzQtYjYwOWQ4ZjA0MDg5?size=2',
  },
  {
    id: 'clairewang',
    name: 'Claire Wang',
    fullName: 'Claire Wang',
    initials: 'CW',
    email: 'clairewang@microsoft.com',
    aliases: ['clairewang@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.NDBiZDc0MTMtZmY5NS03ZjRjLWFkMGItNmYwY2VkNThlZTU1?size=2',
  },
  {
    id: 'jiaruigui',
    name: 'Jiarui Gui',
    fullName: 'Jiarui Gui',
    initials: 'JG',
    email: 'jiaruigui@microsoft.com',
    aliases: ['jiaruigui@microsoft.com'],
    avatarUrl: 'https://msasg.visualstudio.com/_apis/GraphProfile/MemberAvatars/aad.ODMzMDk3YjQtMzcxNy03YWYyLTliMzMtOWZlMjRhNDdmM2Zj?size=2',
  },
];

export const ALL_STANDUP_EMAILS = [...new Set(STANDUP_TEAM.flatMap((m) => m.aliases))];

export function matchTeamMember(item, member) {
  if (!item || !member) return false;
  const email = String(item.assignedTo?.email || '').trim().toLowerCase();
  if (!email) return false;
  return member.aliases.some((a) => a.toLowerCase() === email);
}

export const STANDUP_COLUMNS = [
  { key: 'todo', label: 'To do', defaultState: 'New', hint: 'Planned for this sprint, not started yet' },
  { key: 'active', label: 'In progress', defaultState: 'Active', hint: 'Currently in progress or under review' },
  { key: 'done', label: 'Done', defaultState: 'Closed', hint: 'Resolved or closed in this sprint' },
];

export function standupColumnOf(item) {
  if (!item) return 'todo';
  if (isDone(item) || item.state === 'Resolved') return 'done';
  if (item.state === 'New') return 'todo';
  return 'active';
}
