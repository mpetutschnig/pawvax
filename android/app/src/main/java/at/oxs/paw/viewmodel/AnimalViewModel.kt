package at.oxs.paw.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import at.oxs.paw.model.*
import at.oxs.paw.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AnimalViewModel(private val apiService: ApiService) : ViewModel() {
    private val _animals = MutableStateFlow<List<Animal>>(emptyList())
    val animals: StateFlow<List<Animal>> = _animals

    private val _selectedAnimal = MutableStateFlow<Animal?>(null)
    val selectedAnimal: StateFlow<Animal?> = _selectedAnimal

    private val _animalTags = MutableStateFlow<List<AnimalTag>>(emptyList())
    val animalTags: StateFlow<List<AnimalTag>> = _animalTags

    private val _documents = MutableStateFlow<List<Document>>(emptyList())
    val documents: StateFlow<List<Document>> = _documents

    private val _sharingSettings = MutableStateFlow<SharingSettings?>(null)
    val sharingSettings: StateFlow<SharingSettings?> = _sharingSettings

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState

    fun loadAnimals() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val result = apiService.getAnimals()
                _animals.value = result
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load animals")
            }
        }
    }

    fun loadAnimal(id: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val animal = apiService.getAnimal(id)
                _selectedAnimal.value = animal
                loadAnimalTags(id)
                loadAnimalDocuments(id)
                loadSharingSettings(id)
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load animal")
            }
        }
    }

    fun createAnimal(name: String, species: String, breed: String?, birthdate: String?, tagId: String?, tagType: String?) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = CreateAnimalRequest(name, species, breed, birthdate, tagId, tagType)
                val animal = apiService.createAnimal(request)
                _animals.value = _animals.value + animal
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to create animal")
            }
        }
    }

    fun updateAnimal(id: String, name: String?, species: String?, breed: String?, birthdate: String?) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = UpdateAnimalRequest(name, species, breed, birthdate)
                val updated = apiService.updateAnimal(id, request)
                _selectedAnimal.value = updated
                _animals.value = _animals.value.map { if (it.id == id) updated else it }
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to update animal")
            }
        }
    }

    fun deleteAnimal(id: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                apiService.deleteAnimal(id)
                _animals.value = _animals.value.filter { it.id != id }
                _selectedAnimal.value = null
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to delete animal")
            }
        }
    }

    fun uploadAvatar(id: String, imageBase64: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = AvatarUploadRequest(imageBase64)
                apiService.uploadAvatar(id, request)
                loadAnimal(id)
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to upload avatar")
            }
        }
    }

    private fun loadAnimalTags(id: String) {
        viewModelScope.launch {
            try {
                val tags = apiService.getAnimalTags(id)
                _animalTags.value = tags
            } catch (e: Exception) {
                // Log error but don't fail the whole operation
            }
        }
    }

    private fun loadAnimalDocuments(id: String) {
        viewModelScope.launch {
            try {
                val docs = apiService.getAnimalDocuments(id)
                _documents.value = docs
            } catch (e: Exception) {
                // Log error but don't fail the whole operation
            }
        }
    }

    private fun loadSharingSettings(id: String) {
        viewModelScope.launch {
            try {
                val settings = apiService.getSharing(id)
                _sharingSettings.value = settings
            } catch (e: Exception) {
                // Log error but don't fail the whole operation
            }
        }
    }

    fun updateSharing(id: String, roles: Map<String, Map<String, Boolean>>) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = UpdateSharingRequest(roles)
                val updated = apiService.updateSharing(id, request)
                _sharingSettings.value = updated
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to update sharing settings")
            }
        }
    }

    fun addTag(animalId: String, tagId: String, tagType: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = AddTagRequest(tagId, tagType)
                apiService.addTag(animalId, request)
                loadAnimalTags(animalId)
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to add tag")
            }
        }
    }

    fun clearState() {
        _uiState.value = UiState.Idle
    }
}

sealed class UiState {
    object Idle : UiState()
    object Loading : UiState()
    object Success : UiState()
    data class Error(val message: String) : UiState()
}
