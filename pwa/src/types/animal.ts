export interface AnimalDTO {
  id: string
  unique_id?: string
  name: string
  species: 'dog' | 'cat' | 'other'
  breed?: string
  birthdate?: string
  avatar_path?: string
  address?: string
  dynamic_fields?: string
  avatar_base64?: string
  is_owner?: boolean
  request_role?: string
  contact?: {
    name: string
    email: string
  }
}

export type AnimalListItemDTO = Pick<
  AnimalDTO,
  'id' | 'name' | 'species' | 'breed' | 'birthdate' | 'avatar_path'
>

export interface AdminAnimalDTO {
  id: string
  name: string
  species: 'dog' | 'cat' | 'other'
  breed?: string
  birthdate?: string
  owner_name: string
  owner_email: string
}
